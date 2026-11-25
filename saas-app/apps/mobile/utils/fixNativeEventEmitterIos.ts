import { NativeEventEmitter, Platform } from 'react-native';

/**
 * Evita que `new NativeEventEmitter(null)` rompa la app en iOS cuando un módulo nativo
 * (como PushNotificationIOS o un módulo no enlazado en Expo Go) es nulo.
 */
export function patchNullNativeEventEmitterOnIos(): void {
  if (Platform.OS !== 'ios') return;

  const proto = NativeEventEmitter.prototype as any;
  if (proto.__autoflowSafePatched) return;

  const OriginalEmitter = NativeEventEmitter as any;
  const SafeEmitter: any = function (this: any, nativeModule?: any) {
    if (!nativeModule) {
      this._autoflowNoop = true;
      return;
    }
    return new OriginalEmitter(nativeModule);
  };

  SafeEmitter.prototype = Object.create(OriginalEmitter.prototype);
  SafeEmitter.prototype.constructor = SafeEmitter;
  SafeEmitter.prototype.addListener = function (eventName: string, listener: (...args: any[]) => void) {
    if (this._autoflowNoop) {
      return { remove: () => {} };
    }
    return OriginalEmitter.prototype.addListener.call(this, eventName, listener);
  };
  SafeEmitter.prototype.removeAllListeners = function (eventName: string) {
    if (this._autoflowNoop) return;
    return OriginalEmitter.prototype.removeAllListeners.call(this, eventName);
  };
  SafeEmitter.prototype.removeSubscription = function (subscription: any) {
    if (this._autoflowNoop) return;
    return OriginalEmitter.prototype.removeSubscription.call(this, subscription);
  };
  SafeEmitter.prototype.listenerCount = function (eventName: string) {
    if (this._autoflowNoop) return 0;
    return OriginalEmitter.prototype.listenerCount.call(this, eventName);
  };
  SafeEmitter.prototype.__autoflowSafePatched = true;

  (NativeEventEmitter as any) = SafeEmitter;
}
