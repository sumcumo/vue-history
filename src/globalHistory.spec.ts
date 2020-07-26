import GlobalHistory from './globalHistory'
import History from './history'
import { HistoryInstallOptions } from './types'

function flushPromises() {
  return new Promise(resolve => setTimeout(resolve))
}

describe('GlobalHistory', () => {
  let history: GlobalHistory
  let logMock: jest.SpyInstance

  function prepareHistory(options?: HistoryInstallOptions) {
    history = new GlobalHistory(options)
    logMock = jest.spyOn(History, 'logEventToConsole')
    logMock.mockClear()
    logMock.mockImplementation(() => null)
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

  async function checkFeedCalls(
    { feeds, event, calls, filter }: {
      feeds: HistoryInstallOptions['feed'][],
      event: any,
      filter?: HistoryInstallOptions['filter'],
      calls: number,
    }) {
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
  }

  it('should not send events if not active', () => checkFeedCalls(
    {
      feeds: [false],
      event: {},
      calls: 0,
    },
  ))

  it('should not send non-root-events to the feed', () => checkFeedCalls(
    {
      feeds: [true],
      event: { caller: {} },
      calls: 0,
    },
  ))

  it('should send sync events', () => checkFeedCalls(
    {
      feeds: [true],
      event: { async: false },
      calls: 1,
    },
  ))

  it('should only send async end if not activated', () => checkFeedCalls(
    {
      feeds: [{ asyncStart: false }],
      event: { async: true, promise: Promise.resolve() },
      calls: 1, // this is the finished event
    },
  ))

  it('should send async start & end if activated', () => checkFeedCalls(
    {
      feeds: [true, { asyncStart: true }, ((_, async) => true)],
      event: { async: true, promise: Promise.resolve() },
      calls: 2,
    },
  ))

  it('should send rejected promise events', () => checkFeedCalls(
    {
      feeds: [true],
      event: { async: true, promise: Promise.reject() },
      calls: 2,
    },
  ))

  it('should not send filtered events', () => checkFeedCalls(
    {
      feeds: [true],
      event: { label: 'ignore' },
      calls: 0,
      filter: (event: any) => event.label !== 'ignore',
    },
  ))

  it('should send non-filtered events', () => checkFeedCalls(
    {
      feeds: [true],
      event: { label: 'include' },
      calls: 1,
      filter: (event: any) => event.label !== 'ignore',
    },
  ))

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
