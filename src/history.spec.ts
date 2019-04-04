import History from './history'

describe('History', () => {

  it('should store events', () => {
    const event = {} as any
    const history = new History({})
    history.push(event)
    expect(history.events).toHaveLength(1)
    expect(history.events[0]).toBe(event)
  })

  it('should filter events before storing', () => {
    const eventStore = { async: true } as any
    const eventNoStore = { async: false } as any
    const history = new History({ filter: el => !!el.async })
    history.push(eventStore)
    history.push(eventNoStore)
    expect(history.events).toHaveLength(1)
    expect(history.events[0]).toBe(eventStore)
  })

  it('should print all recieved events', () => {
    const event = {} as any
    const eventNonRoot = { caller: event } as any
    const mock = jest.fn()
    const history = new History({})
    const originalLogEvent = History.logEventToConsole
    History.logEventToConsole = mock

    history.push(event)
    history.push(eventNonRoot)
    history.push(event)
    history.push(eventNonRoot)
    history.push(event)

    history.print({ hierarchical: false })

    expect(mock).toBeCalledTimes(5)
    expect(mock).toHaveBeenNthCalledWith(1, event, { hierarchical: false })
    expect(mock).toHaveBeenNthCalledWith(2, eventNonRoot, { hierarchical: false })

    mock.mockClear()

    history.print()
    expect(mock).toBeCalledTimes(3)
    expect(mock).toHaveBeenNthCalledWith(1, event, {})
    History.logEventToConsole = originalLogEvent
  })

  it('should compute the state of an event', () => {
    const started = new Date(new Date().getTime() - 100)
    const done = new Date(started.getTime() + 50)

    const expectations = [
      [
        { async: true, done: null },
        {
          state: 'pending',
          message: [expect.stringMatching(/pending \(took \d+ms so far\)/)],
        },
      ],
      [
        { async: true, done },
        {
          state: 'doneOk',
          message: [expect.stringMatching(/async \(took \d+ms\)/)],
        },
      ],
      [
        { async: false, error: new Error('Bug') },
        {
          state: 'doneErrored',
          message: ['errored', new Error('Bug')],
        },
      ],
      [
        { async: true, done, error: new Error('Bug') },
        {
          state: 'doneErrored',
          message: [expect.stringMatching(/async \(took \d+ms\)/), 'errored', new Error('Bug')],
        },
      ],
    ]

    expectations.forEach(([input, expectation]) => {
      const output = History.getEventState({ ...input, timestamp: started } as any)
      expect(output).toEqual(expectation)
    })
  })
})

describe('console', () => {
  const CONSOLE_KEYS: (keyof Console)[] = ['log', 'groupEnd', 'groupCollapsed', 'group']

  let oldConsole: { [key: string]: Function }
  let log: any[]
  let event: any

  beforeEach(() => {
    oldConsole = {}
    log = []

    CONSOLE_KEYS.forEach((key: keyof Console) => {
      oldConsole[key] = global.console[key]
      global.console[key] = jest.fn().mockImplementation((...args) => log.push([key, args.join(' ')]))
    })

    event = {
      timestamp: new Date(),
      done: null,
      async: true,
      namespace: 'parent',
      callId: 'parentCallId',
      payload: 'event',
      subEvents: [
        {
          timestamp: new Date(),
          done: new Date(),
          async: false,
          namespace: 'child',
          callId: 'childCallId',
          payload: 'subEvent',
          subEvents: [],
        },
      ],
    }
  })

  afterEach(() => {
    CONSOLE_KEYS.forEach((key: keyof Console) => {
      global.console[key] = oldConsole[key]
    })
  })

  it('should log default', () => {
    const expectations = [
      [
        undefined,
        ['groupCollapsed', expect.stringMatching(/%cparent%cparentCallId.+border-radius.+args: event/)],
        ['log', expect.stringMatching(/%cchild%cchildCallId.+border-radius.+args: subEvent/)],
        ['groupEnd', ''],
      ],
      [
        { collapse: false },
        ['group', expect.stringMatching(/%cparent%cparentCallId.+border-radius.+args: event/)],
        ['log', expect.stringMatching(/%cchild%cchildCallId.+border-radius.+args: subEvent/)],
        ['groupEnd', ''],
      ],
      [
        { time: true, hierarchical: false },
        ['log', expect.stringMatching(/%cparent%cparentCallId.+border-radius.+args: event/)],
        ['log', expect.stringMatching(/%cchild%cchildCallId.+border-radius.+args: subEvent/)],
      ],
    ]

    expectations.forEach(([options, ...expectation]) => {
      log = []
      History.logEventToConsole(event, options as any)
      expect(log).toEqual(expectation)
    })
  })
})
