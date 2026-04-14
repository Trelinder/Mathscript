/**
 * useCosmosSignalR.js
 *
 * Custom React hook that connects to an Azure SignalR Service endpoint and
 * listens for real-time metric events emitted by the Azure Function that
 * watches the Cosmos DB Change Feed.  When new data arrives the hook updates
 * its local state so AdminDashboard chart components animate in real-time.
 *
 * Architecture:
 *   Cosmos DB Change Feed
 *       → Azure Function (trigger)
 *       → Azure SignalR Service broadcast
 *       → useCosmosSignalR (WebSocket client)
 *       → AdminDashboard chart state
 *
 * Usage:
 *   const { metrics, isConnected, lastUpdated, error } = useCosmosSignalR({
 *     endpoint: 'https://<your-service>.service.signalr.net',
 *     hubName:  'metricsHub',
 *     accessToken: adminKey,             // optional: forwarded as Bearer
 *     onMetricsUpdated: (data) => {},    // optional side-effect callback
 *   })
 *
 * The hook:
 *   - Negotiates a SignalR connection using the @microsoft/signalr HubConnection
 *   - Listens for the 'metricsUpdated' event and merges incoming data
 *   - Automatically reconnects with exponential back-off on drop
 *   - Cleans up on unmount so no dangling WebSocket connections remain
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'

const SIGNALR_EVENT = 'metricsUpdated'

/**
 * @typedef {Object} SignalROptions
 * @property {string}   endpoint          - Azure SignalR service URL (required)
 * @property {string}   [hubName]         - Hub name to join (default: 'metricsHub')
 * @property {string}   [accessToken]     - Bearer token sent during negotiate
 * @property {Function} [onMetricsUpdated]- Optional callback fired on each update
 */

/**
 * @typedef {Object} SignalRResult
 * @property {object|null} metrics     - Latest metrics payload from the Change Feed
 * @property {boolean}     isConnected - Whether the SignalR connection is active
 * @property {Date|null}   lastUpdated - Timestamp of the last received event
 * @property {string|null} error       - Error message if connection failed
 */

/**
 * useCosmosSignalR — connects to Azure SignalR and streams Cosmos Change Feed metrics.
 *
 * @param {SignalROptions} opts
 * @returns {SignalRResult}
 */
export function useCosmosSignalR({ endpoint, hubName = 'metricsHub', accessToken, onMetricsUpdated } = {}) {
  const [metrics,     setMetrics]     = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error,       setError]       = useState(null)

  // Stable ref for the callback to avoid re-building the connection on every render
  const onUpdateRef = useRef(onMetricsUpdated)
  useEffect(() => { onUpdateRef.current = onMetricsUpdated }, [onMetricsUpdated])

  const connectionRef = useRef(/** @type {signalR.HubConnection|null} */ (null))

  const buildConnection = useCallback(() => {
    if (!endpoint) return null

    const builder = new signalR.HubConnectionBuilder()
      .withUrl(`${endpoint}/${hubName}`, {
        ...(accessToken
          ? { accessTokenFactory: () => accessToken }
          : {}),
        // Skip WebSocket negotiation when running behind Azure SignalR service —
        // the service always uses WebSockets in the serverless model.
        transport: signalR.HttpTransportType.WebSockets,
        skipNegotiation: !accessToken,  // negotiate only when auth is required
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    builder.on(SIGNALR_EVENT, (data) => {
      try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data
        setMetrics(prev => ({ ...(prev ?? {}), ...parsed }))
        setLastUpdated(new Date())
        setError(null)
        onUpdateRef.current?.(parsed)
      } catch (parseErr) {
        console.warn('[useCosmosSignalR] payload parse error:', parseErr)
      }
    })

    builder.onreconnecting(() => {
      setIsConnected(false)
    })

    builder.onreconnected(() => {
      setIsConnected(true)
      setError(null)
    })

    builder.onclose((err) => {
      setIsConnected(false)
      if (err) {
        setError(err.message ?? 'SignalR connection closed unexpectedly')
      }
    })

    return builder
  }, [endpoint, hubName, accessToken])

  useEffect(() => {
    if (!endpoint) return

    const conn = buildConnection()
    if (!conn) return
    connectionRef.current = conn

    let mounted = true

    conn.start()
      .then(() => {
        if (!mounted) return
        setIsConnected(true)
        setError(null)
      })
      .catch((startErr) => {
        if (!mounted) return
        console.warn('[useCosmosSignalR] connection start failed:', startErr)
        setError(startErr?.message ?? 'Failed to connect to SignalR')
        setIsConnected(false)
      })

    return () => {
      mounted = false
      if (connectionRef.current) {
        connectionRef.current.stop().catch(() => {})
        connectionRef.current = null
      }
      setIsConnected(false)
    }
  }, [endpoint, hubName, accessToken, buildConnection])

  return { metrics, isConnected, lastUpdated, error }
}
