import {
  createLocalVue,
  mount,
} from '@vue/test-utils'
import ComponentHistory from './componentHistory'
import GlobalHistory from './globalHistory'
import VueHistory from './index'

function flushPromises() {
  return Promise.resolve()
}

const localVue = createLocalVue()
localVue.use(VueHistory)

// https://github.com/facebook/jest/issues/1377#issuecomment-252410768
const syncify = async (fn: Function) => {
  try {
    const result = await fn()
    return () => result
  } catch (e) {
    return () => {
      throw e
    }
  }
}

/* tslint:disable-next-line:variable-name */
const SomeTrackedComponent = {
  history: true,
  name: 'SomeTrackedComponent',
  data() {
    return {
      count: 0,
      setObj: {},
    }
  },
  methods: {
    incrementProxies(this: any, inc: number) {
      return new Promise((resolve) => {
        setTimeout(
          () => {
            resolve(this.increment(inc))
          },
          20,
        )
      })
    },
    mirrorThis() {
      return this
    },
    nestedCallsWrap(this: any) {
      this.count += 1
      this.nestedCallsChild()
    },
    nestedCallsChild(this: any) {
      this.count += 1
    },
    increment(this: any, inc: number) {
      this.count += inc
      return this.count
    },
    incrementInvalid(this: any) {
      return new Promise((resolve) => {
        setTimeout(
          () => {
            this.count += 1
            resolve()
          },
          20,
        )
      })
    },
    asyncError() {
      return new Promise(() => {
        throw new Error('ASYNC_ERROR_MESSAGE')
      })
    },
    syncError() {
      throw Error('SYNC_ERROR_MESSAGE')
    },
  },
  render(this: any) {
    return this.foo
  },
}

/* tslint:disable-next-line:variable-name */
const SomeUntrackedComponent = {
  data() {
    return {
      foo: 'bar',
    }
  },
  render(this: any) {
    return this.foo
  },
}

describe('vue-component-history', () => {
  let wrapper: any
  let wrapperUntracked: any

  let mockError: jest.Mock<any>
  let storedError: any

  beforeEach(() => {
    jest.resetModules()
    wrapper = mount(SomeTrackedComponent, { localVue })
    wrapperUntracked = mount(SomeUntrackedComponent, { localVue })
    mockError = jest.fn()
    // @ts-ignore
    storedError = global.console.error
    // @ts-ignore
    global.console.error = mockError
  })

  afterEach(async () => {
    await flushPromises()
  })

  afterEach(() => {
    // @ts-ignore
    global.console.error = storedError
  })

  it('should add the $globalHistory and $history on tracked components', () => {
    expect(wrapper.vm.$globalHistory).toBeInstanceOf(GlobalHistory)
    expect(wrapper.vm.$history).toBeInstanceOf(ComponentHistory)

    // methodless
    wrapper = mount({ history: true } as any, { localVue })
    expect(wrapper.vm.$globalHistory).toBeInstanceOf(GlobalHistory)
    expect(wrapper.vm.$history).toBeInstanceOf(ComponentHistory)

    // untracked
    wrapper = mount({} as any, { localVue })
    expect(wrapper.vm.$globalHistory).toBeInstanceOf(GlobalHistory)
    expect(wrapper.vm.$history).not.toBeInstanceOf(ComponentHistory)
  })

  it('should track synchronous updates of known methods', () => {
    expect(wrapper.vm.$history.items).toHaveLength(0)
    wrapper.vm.increment(1)
    expect(wrapper.vm.$history.items).toHaveLength(1)
    const event = wrapper.vm.$history.items[0]
    expect(event.async).toBe(false)
    expect(event.done).toBeInstanceOf(Date)
    expect(event.error).toBe(null)
    expect(event.namespace).toEqual('SomeTrackedComponent')
    expect(event.callId).toEqual('increment')
    expect(JSON.parse(event.payload)).toEqual([1])
    expect(wrapper.vm.count).toBe(1)
  })

  it('should track updates via $set', async () => {
    expect(wrapper.vm.$history.items).toHaveLength(0)
    wrapper.vm.$set(wrapper.vm.setObj, 'zap', 'some')
    expect(wrapper.vm.setObj.zap).toBe('some')
    expect(wrapper.vm.$history.items).toHaveLength(1)
    const event = wrapper.vm.$history.items[0]
    expect(event.async).toBe(false)
    expect(event.done).toBeInstanceOf(Date)
    expect(event.error).toBe(null)
    expect(event.namespace).toEqual('SomeTrackedComponent.$set')
    expect(event.callId).toEqual('zap')
    expect(event.payload).toBe('some')
    // expect(JSON.parse(event.payload)).toEqual([1])
  })

  it('should push events to the global history', () => {
    wrapper.vm.increment(1)
    expect(wrapper.vm.$history.items[0]).toBe(wrapper.vm.$globalHistory.items[0])
  })

  it('should track nested, asynchronous method calls', async () => {
    const promise = wrapper.vm.incrementProxies(2)
    expect(wrapper.vm.$history.items[0].done).toBe(null)
    const result = await promise
    // result should be forwarded
    expect(result).toBe(2)

    expect(wrapper.vm.$history.items).toHaveLength(2)

    const [firstEvent, secondEvent] = wrapper.vm.$history.items

    expect(await firstEvent.promise).toBeUndefined()
    expect(firstEvent.async).toBe(true)
    expect(firstEvent.done).toBeInstanceOf(Date)
    expect(firstEvent.error).toBe(null)
    expect(firstEvent.namespace).toEqual('SomeTrackedComponent')
    expect(firstEvent.callId).toEqual('incrementProxies')
    expect(JSON.parse(firstEvent.payload)).toEqual([2])

    expect(await secondEvent.promise).toBeUndefined()
    expect(secondEvent.async).toBe(false)
    expect(secondEvent.done).toBeInstanceOf(Date)
    expect(secondEvent.error).toBe(null)
    expect(secondEvent.namespace).toEqual('SomeTrackedComponent')
    expect(secondEvent.callId).toEqual('increment')
    expect(JSON.parse(secondEvent.payload)).toEqual([2])
    expect(firstEvent.subEvents[0]).toBe(secondEvent)

    expect(wrapper.vm.count).toBe(2)
  })

  it('should track errors in synchronous method calls', async () => {
    expect(() => wrapper.vm.syncError()).toThrowError('SYNC_ERROR_MESSAGE')
    const event = wrapper.vm.$history.items[0]

    const readResult = await syncify(async () => await event.promise)
    expect(readResult).toThrowError('SYNC_ERROR_MESSAGE')

    expect(event.done).toBeInstanceOf(Date)
    expect(event.error).toBeInstanceOf(Error)
    expect(event.error.message).toBe('SYNC_ERROR_MESSAGE')
  })

  it('should track errors in asynchronous method calls', async () => {
    const syncFunction = await syncify(wrapper.vm.asyncError)
    expect(syncFunction).toThrowError('ASYNC_ERROR_MESSAGE')

    const event = wrapper.vm.$history.items[0]

    const readResult = await syncify(async () => await event.promise)
    expect(readResult).toThrowError('ASYNC_ERROR_MESSAGE')

    expect(event.done).toBeInstanceOf(Date)
    expect(event.error).toBeInstanceOf(Error)
    expect(event.error.message).toBe('ASYNC_ERROR_MESSAGE')
  })

  it('should report invalid, asynchronous updates in strict mode [default]', async () => {
    await wrapper.vm.incrementInvalid()

    expect(mockError).toBeCalledTimes(1)
    expect(mockError).toBeCalledWith(
      'Changed data asynchronously or outside of sync method',
      expect.objectContaining({
        after: { count: 1, setObj: {} },
        before: { count: 0, setObj: {} },
        revealedBy: { type: '$watch' },
      }),
    )
  })

  it('should track cross-component calls if read from \'this\'', () => {
    /* tslint:disable-next-line:variable-name */
    const SomeCrossTrackedComponent = {
      history: true,
      computed: {
        someTrackedComponent(this: any): any {
          return this.$parent
        },
      },
      methods: {
        crossCallComponent() {
          return (this as any).someTrackedComponent.increment(45)
        },
      },
    }

    wrapper = mount(
      {
        ...SomeTrackedComponent,
        render(h: Function) {
          return h(SomeCrossTrackedComponent)
        },
      } as any,
      { localVue },
    )

    const crossTrackedVm = wrapper.find(SomeCrossTrackedComponent).vm
    expect(crossTrackedVm.crossCallComponent()).toBe(45)

    const { items } = wrapper.vm.$globalHistory

    expect(items).toHaveLength(2)
    expect(items[1].callId).toBe('crossCallComponent')
    expect(items[0].caller).toBe(items[1])
  })

  it('should keep correct context for reused component', () => {
    // remount
    const firstThis = wrapper.vm.mirrorThis()
    const secondThis = mount(SomeTrackedComponent, { localVue }).vm.mirrorThis()
    expect(firstThis).not.toBe(secondThis)

    firstThis.increment(1)
    secondThis.increment(2)

    expect(firstThis.count).toBe(1)
    expect(secondThis.count).toBe(2)
  })

  it('should set uniquely bound methods', () => {
    const wrap = mount(
      {
        render(h: Function) {
          return h('div', [h(SomeTrackedComponent), h(SomeTrackedComponent)])
        },
      },
      { localVue },
    )

    const [firstMethods, secondMethods] = wrap.vm.$children.map(el => el.$options.methods!)

    expect(firstMethods).not.toBe(secondMethods)

    expect(firstMethods!.mirrorThis).not.toBe(secondMethods!.mirrorThis)
    expect(firstMethods!.mirrorThis).toBeInstanceOf(Function)
    expect(secondMethods!.mirrorThis).toBeInstanceOf(Function)
  })

  it('should not report invalid, asynchronous updates if strict mode is disabled', async () => {
    const localVue = createLocalVue()
    localVue.use(VueHistory, { strict: false })
    expect(mockError).toBeCalledTimes(0)

    wrapper = mount(SomeTrackedComponent, { localVue })
    await wrapper.vm.incrementInvalid()

    expect(mockError).toBeCalledTimes(0)
  })

  it('should not report invalid updates in case of nested methods', () => {
    const localVue = createLocalVue()
    localVue.use(VueHistory)
    expect(mockError).toBeCalledTimes(0)

    wrapper = mount(SomeTrackedComponent, { localVue })
    wrapper.vm.nestedCallsWrap()

    expect(mockError).toBeCalledTimes(0)
  })
})
