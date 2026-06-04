const notifyPWAStatus = (detail) => {
  window.dispatchEvent(new CustomEvent('pwa-status-change', { detail }))
}

const registerPWA = async () => {
  if (!('serviceWorker' in navigator)) {
    notifyPWAStatus({ serviceWorkerSupported: false, serviceWorkerReady: false })
    return
  }

  try {
    const serviceWorkerUrl = `${import.meta.env.BASE_URL}sw.js`
    const registration = await navigator.serviceWorker.register(serviceWorkerUrl, {
      scope: import.meta.env.BASE_URL,
    })

    notifyPWAStatus({
      serviceWorkerSupported: true,
      serviceWorkerReady: Boolean(navigator.serviceWorker.controller),
    })

    await navigator.serviceWorker.ready

    notifyPWAStatus({
      serviceWorkerSupported: true,
      serviceWorkerReady: true,
    })

    registration.update().catch(() => {})
  } catch (error) {
    console.warn('PWA service worker registration failed:', error)
    notifyPWAStatus({
      serviceWorkerSupported: true,
      serviceWorkerReady: false,
      serviceWorkerError: error?.message || 'Service worker registration failed',
    })
  }
}

void registerPWA()
