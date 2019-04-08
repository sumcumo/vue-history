import History from './history'
import {
  Event,
  HistoryInstallOptions,
  ShouldFeedCallback,
} from './types'

export default class GlobalHistory extends History {
  sendToFeed: ShouldFeedCallback

  constructor(options: HistoryInstallOptions = {}) {
    super(options)
    const { feed } = options
    this.sendToFeed =
      typeof feed === 'function' ? feed
        : feed instanceof Object ? ((_, async) => (!async || feed.asyncStart))
        : () => Boolean(feed)
  }

  push(event: Event) {
    super.push(event, () => {
      if (this.options.onEvent) {
        this.options.onEvent(event)
      }
      if (this.options.feed) {
        this.logNewEvent(event)
      }
    })
  }

  logNewEvent(event: Event) {
    if (event.caller) {
      return
    }

    if (!event.async) {
      if (this.sendToFeed(event, false)) {
        History.logEventToConsole(event)
      }
      return
    }

    if (this.sendToFeed(event, true)) {
      History.logEventToConsole(event)
    }

    event
      .promise
      .then(() => this.logResolved(event))
      .catch(() => this.logResolved(event))
  }

  logResolved(event: Event) {
    if (this.sendToFeed(event, false)) {
      History.logEventToConsole(event)
    }
  }
}
