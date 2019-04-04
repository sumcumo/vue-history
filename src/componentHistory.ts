// import * as serialize is incompatible with compilation to ESM -> UMD
// https://github.com/rollup/rollup-plugin-commonjs/issues/157#issuecomment-284858177
import { getSerialize } from 'json-stringify-safe'
import {
  Event,
  HistoryInstallOptions,
  VueWithHistory,
} from './types'
import History from './history'

const stringify = (val: any) => typeof val === 'string' ? val : JSON.stringify(val, getSerialize(null, undefined))

export default class ComponentHistory extends History {
  private snapshot: string | null = null
  originalMethods: { [key: string]: Function }
  inCallback = 0
  namespace = ''

  constructor(
    options: HistoryInstallOptions,
    private vm: VueWithHistory,
  ) {
    super(options)
    this.originalMethods = Object.assign({}, vm.$options.methods)
    this.namespace = this.vm.$options.name || 'unknown'
  }

  push(event: Event) {
    super.push(event)
    if (this.vm.$globalHistory) {
      this.vm.$globalHistory.push(event)
    }
  }

  created() {
    if (this.options.strict) {
      this.takeSnapshot()
    }
  }

  checkForDataChanges(revealedBy?: any) {
    const newSnapshot = stringify(this.vm.$data)
    if (this.snapshot !== null && newSnapshot !== this.snapshot
      && this.vm.$root.$el // check if only virtual (e.g. mirror inside devTools)
    ) {

      console.error('Changed data asynchronously or outside of sync method', {
        before: JSON.parse(this.snapshot),
        after: JSON.parse(newSnapshot),
        on: this.vm,
        revealedBy,
      })
      this.snapshot = newSnapshot
    }
  }

  takeSnapshot() {
    this.snapshot = stringify(this.vm.$data)
  }

  proxyVM(caller?: Event) {
    const methodKeys = Object.keys(this.vm.$options.methods!)

    return new Proxy(this.vm, {
      get: (target, prop: string, receiver) => {
        if (methodKeys.includes(prop)) {
          return this.proxyMethod(prop, this.originalMethods[prop], caller)
        }
        // @ts-ignore
        const val = Reflect.get(...arguments)
        if (val instanceof Object && val.$history) {
          // track cross-component calls
          return val.$history.proxyVM(caller)
        }
        return val
      },
    })
  }

  trackMethodCall(callData: Partial<Event>): { event: Event, runTracked: (cb: () => any) => any } {
    let setDone: (error?: Error) => void
    const callEvent: Event = {
      timestamp: new Date(),
      namespace: '%none%',
      callId: '%none%',
      caller: undefined,
      payload: '',
      subEvents: [],
      error: null,
      async: false,
      promise: new Promise((resolve, reject) => {
        setDone = function setDone(error?: Error) {
          callEvent.done = new Date()
          if (error) {
            callEvent.error = error
            reject(error)
          } else {
            resolve()
          }
        }
      }),
      done: null,
      ...callData,
    }

    // avoid duplicated logged errors
    callEvent.promise.catch(() => null)

    // defer push until type of event (async) is computed
    const store = () => {
      this.push(callEvent)
      if (callEvent.caller) {
        callEvent.caller.subEvents.push(callEvent)
      }
    }

    function runTracked(cb: () => any) {
      try {
        const res = cb()

        if (res instanceof Promise) {
          callEvent.async = true
          res.then(() => setDone()).catch((e: Error) => setDone(e))
        } else {
          setDone()
        }

        store()
        return res
      } catch (e) {
        setDone(e)
        store()
        throw e
      }
    }

    return { event: callEvent, runTracked }
  }

  proxyMethod(methodKey: string, originalFn: Function, caller?: Event): Function {
    // do not inline to preserve function name for stack-traces
    const proxiedMethod = (...args: any[]) => {
      let namespace = this.namespace
      let callId = methodKey
      let payload = args

      if (methodKey === '$set') {
        namespace += '.$set'
        callId = payload[1]
        payload = payload[2]
      }

      const { event, runTracked } = this.trackMethodCall({
        namespace,
        callId,
        caller,
        payload: stringify(payload),
      })

      const applyToOriginalFunction = () => originalFn.apply(this.proxyVM(event), args)

      if (!this.options.strict || this.inCallback) {
        return runTracked(applyToOriginalFunction)
      }

      this.inCallback += 1

      this.checkForDataChanges({
        type: 'proxyMethod',
        namespace,
        callId,
        payload,
      })
      const res = runTracked(applyToOriginalFunction)
      this.takeSnapshot()

      this.inCallback -= 1
      return res
    }

    return proxiedMethod
  }
}
