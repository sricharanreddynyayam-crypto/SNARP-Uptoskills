import { useState } from 'react'

export function useLoginPrompt(authenticated) {
  const [request, setRequest] = useState(null)

  function requireAuth(action, opener) {
    if (authenticated) return action()
    setRequest({ opener })
  }

  return {
    requireAuth,
    promptProps: {
      open: !authenticated && request !== null,
      onClose: () => setRequest(null),
      returnFocus: request?.opener,
    },
  }
}
