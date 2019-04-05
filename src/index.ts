import { ComponentOptions } from 'vue'
import { PluginObject } from 'vue/types/plugin'
import ComponentHistory from './componentHistory'
import GlobalHistory from './globalHistory'
import {
  Event,
  HistoryInstallOptions,
  VueWithHistory,
} from './types'

const DEFAULT_INSTALL_OPTIONS: Partial<HistoryInstallOptions> = {
  strict: true,
  onEvent: (_: Event) => null,
}

function setupProxies(this: VueWithHistory) {
  const methods: ComponentOptions<VueWithHistory>['methods'] = {}

  // wrap all methods
  Object
    .keys(this.$options.methods || {})
    .forEach((methodKey) => {
      methods[methodKey] = this.$history.proxyMethod(
        methodKey,
        this.$history.originalMethods[methodKey],
      ) as any
    })

  this.$options.methods = methods;

  // override $set to ease third party integration
  (this as any).$set = this.$history.proxyMethod('$set', this.$set)
}

function setupWatcher(this: VueWithHistory) {
  // watch data for untracked changes
  Object.keys(this.$data).forEach((key) => {
    this.$watch(
      key,
      () => {
        if (this.$history.inCallback === 0) {
          this.$history.checkForDataChanges({ type: '$watch' })
        }
      },
      { deep: true },
    )
  })
}

export default {
  install(vue, inputInstallOptions = {}) {
    /* istanbul ignore if */
    if (typeof Proxy === 'undefined') {
      console.error('History is not installed in browsers not supporting ES6-Proxy')
      return
    }

    const installOptions = Object.assign({}, DEFAULT_INSTALL_OPTIONS, inputInstallOptions)

    vue.mixin(
      {
        beforeCreate(this: VueWithHistory) {
          this.$globalHistory = this === this.$root
            ? new GlobalHistory(installOptions)
            : (<VueWithHistory>this.$root).$globalHistory

          if (!this.$options.history) {
            return
          }

          // create local history
          this.$history = new ComponentHistory(installOptions, this)

          setupProxies.call(this)
        },

        created(this: VueWithHistory) {
          if (this.$history) {
            this.$history.created()

            if (installOptions.strict) {
              setupWatcher.call(this)
            }
          }
        },
      },
    )
  },
} as PluginObject<HistoryInstallOptions>
