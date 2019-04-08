import GlobalHistory from './globalHistory'
import History from './history'
import { HistoryInstallOptions } from './types'

function flushPromises() {
  return Promise.resolve()
}

describe('GlobalHistory', () => {
  let history: GlobalHistory
  let logMock: Function

  function prepareHistory(options?: HistoryInstallOptions) {
    logMock = jest.fn()
    history = new GlobalHistory(options)
    History.logEventToConsole = logMock as any
  }

  it('should push events to the log', () => {
    prepareHistory()
    // @ts-ignore
    expect(history.items).toHaveLength(0)
    history.push({} as any)
    // @ts-ignore
    expect(history.items).toHaveLength(1)
  })

  it('should send events to onEvent if registered', () => {
    const mock = jest.fn()
    const event = {} as any
    prepareHistory({ onEvent: mock })
    history.push(event)
    expect(mock).toHaveBeenCalledTimes(1)
    expect(mock).toHaveBeenCalledWith(event)
  })

  function checkFeedCalls(
    describe: string,
    { feeds, event, calls, filter }: {
      feeds: HistoryInstallOptions['feed'][],
      event: any,
      filter?: HistoryInstallOptions['filter'],
      calls: number,
    }) {
    it(describe, async () => {
      expect.assertions(feeds.length * (1 + calls))
      for (const feed of feeds) {
        prepareHistory({ feed, filter })
        history.push(event)
        await flushPromises()
        expect(logMock).toHaveBeenCalledTimes(calls)
        for (let i = 1; i <= calls; i += 1) {
          expect(logMock).toHaveBeenNthCalledWith(i, event)
        }
      }
    })
  }

  checkFeedCalls(
    'should not send events if not active',
    {
      feeds: [false],
      event: {},
      calls: 0,
    },
  )

  checkFeedCalls(
    'should not send non-root-events to the feed',
    {
      feeds: [true],
      event: { caller: {} },
      calls: 0,
    },
  )

  checkFeedCalls(
    'should send sync events',
    {
      feeds: [true],
      event: { async: false },
      calls: 1,
    },
  )

  checkFeedCalls(
    'should only send async end if not activated',
    {
      feeds: [{ asyncStart: false }],
      event: { async: true, promise: Promise.resolve() },
      calls: 1, // this is the finished event
    },
  )

  checkFeedCalls(
    'should send async start & end if activated',
    {
      feeds: [true, { asyncStart: true }, ((_, async) => true)],
      event: { async: true, promise: Promise.resolve() },
      calls: 2,
    },
  )

  checkFeedCalls(
    'should send rejected promise events',
    {
      feeds: [true],
      event: { async: true, promise: Promise.reject() },
      calls: 2,
    },
  )

  checkFeedCalls(
    'should not send filtered events',
    {
      feeds: [true],
      event: { label: 'ignore' },
      calls: 0,
      filter: (event: any) => event.label !== 'ignore',
    },
  )

  checkFeedCalls(
    'should send non-filtered events',
    {
      feeds: [true],
      event: { label: 'include' },
      calls: 1,
      filter: (event: any) => event.label !== 'ignore',
    },
  )

  it('should send async start if activated', async () => {
    const event = { async: true, promise: Promise.resolve() } as any
    prepareHistory({ feed: true })
    history.push(event)
    await flushPromises()
    expect(logMock).toHaveBeenCalledTimes(2)
    expect(logMock).toHaveBeenNthCalledWith(1, event)
    expect(logMock).toHaveBeenNthCalledWith(2, event)
  })

})
