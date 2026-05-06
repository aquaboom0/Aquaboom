import React, { useEffect } from 'react';
import { StatusBar, LogBox } from 'react-native';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { store } from './src/store';
import AppNavigator from './src/navigation/AppNavigator';
import {
  attachOrderPushBridge,
  attachAgentNotificationTapRouter,
} from './src/services/pushNotifications';
import { loadUser } from './src/store/slices/authSlice';
import { COLORS } from './src/config';
import { hydrateEndpointOverride } from './src/config/dynamicEndpoints';

// Ignore specific warnings
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'VirtualizedLists should never be nested',
]);

const App = () => {
  useEffect(() => {
    (async () => {
      await hydrateEndpointOverride();
      store.dispatch(loadUser());
    })();
  }, []);

  useEffect(() => {
    attachOrderPushBridge();
    return attachAgentNotificationTapRouter();
  }, []);

  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} translucent={false} />
        <AppNavigator />
      </SafeAreaProvider>
    </Provider>
  );
};

export default App;