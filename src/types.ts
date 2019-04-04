import Vue from 'vue'
import ComponentHistory from './componentHistory'
import History from './history'

export type VueWithHistory = Vue & {
  $options: {
    history: boolean,
    globalHistory: History | undefined,
  },
  $history: ComponentHistory,
  $globalHistory: History,
}

export interface Event {
  timestamp: Date,
  namespace: string,
  callId: string,
  caller?: Event,
  payload: string,
  subEvents: Event[],
  error: Error | null,
  async: boolean,
  promise: Promise<any>,
  done: Date | null,
}

export type ShouldFeedCallback = (event: Event, asyncStart: boolean) => boolean

export interface HistoryInstallOptions {
  strict?: boolean,
  filter?: (event: Event) => boolean,
  onEvent?: (event: Event) => void,
  feed?: boolean | { asyncStart: boolean } | ShouldFeedCallback,
}

export interface PrintOptions {
  time: boolean,
  collapse: boolean,
  hierarchical: boolean,
}
