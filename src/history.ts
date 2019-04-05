import {
  Event,
  HistoryInstallOptions,
  PrintOptions,
} from './types'

const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  time: false,
  collapse: true,
  hierarchical: true,
}

const STATE_COLORS = {
  neutral: '#35495E',
  doneOk: '#29cc29',
  doneErrored: '#cc0000',
  pending: '#7acccc',
}

type EventState = keyof typeof STATE_COLORS

export default class History {

  public static getEventAsyncDescription(event: Event) {
    if (!event.async) {
      return null
    }

    const start = event.timestamp.getTime()

    if (event.done) {
      const ms = event.done.getTime() - start
      return `async (took ${ms}ms)`
    }

    const ms = new Date().getTime() - start
    return `pending (took ${ms}ms so far)`
  }

  public static getEventState(event: Event): { state: EventState, message: string[] } {
    let state: EventState
    const message: any[] = []

    const asyncDescription = History.getEventAsyncDescription(event)

    if (asyncDescription) {
      message.push(asyncDescription)
    }

    if (event.error) {
      state = 'doneErrored'
      message.push('errored', event.error)
    } else if (!event.done) {
      state = 'pending'
    } else {
      state = 'doneOk'
    }

    return { state, message }
  }

  public static createLogStatement({ event, time }: { event: Event, time: string | boolean }): string[] {
    const { state, message } = History.getEventState(event)
    const color = STATE_COLORS[state]

    return [
      [
        time,
        `%c${event.namespace}%c${event.callId}`,
      ].filter(Boolean).join(' '),
      `color: #fff; background: ${STATE_COLORS.neutral}; padding: 1px 4px; border-radius: 3px 0 0 3px;`,
      `color: #fff; background: ${color}; padding: 1px 4px; border-radius: 0 3px 3px 0;`,
      'args:',
      event.payload,
      ...message,
    ]
  }

  public static logEventToConsole(
    event: Event,
    userOptions: Partial<PrintOptions> = {},
    depth = 0,
  ) {
    const options = Object.assign({}, DEFAULT_PRINT_OPTIONS, userOptions)
    const time = event.timestamp.toISOString().substr(11)

    const logSubEvents = () => {
      event.subEvents.forEach(
        subEvent => History.logEventToConsole(subEvent, options, depth + 1))
    }

    const logParams = History.createLogStatement({
      time: options.time && time,
      event,
    })

    if (event.subEvents.length !== 0 && options.hierarchical) {
      const fn = options.collapse ? console.groupCollapsed : console.group
      fn(...logParams)
      logSubEvents()
      console.groupEnd()
    } else {
      console.log(...logParams)
      logSubEvents()
    }
  }

  private items: Event[] = []

  get events() {
    return this.items
  }

  constructor(protected options: HistoryInstallOptions) {
  }

  push(event: Event) {
    if (this.options.filter && !this.options.filter(event)) {
      return
    }
    this.items.push(event)
  }

  print(userOptions: Partial<PrintOptions> = {}) {
    let events = this.items

    if (userOptions.hierarchical !== false) {
      // get "root" events
      events = events.filter(event => !event.caller)
    }

    events.forEach(
      event => History.logEventToConsole(
        event,
        userOptions,
      ))
  }
}
