import { API_BASE } from './config'

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`)
  }
  return res.json()
}

export const injectFault = (faultType) => post('/inject-fault', { fault_type: faultType })
export const clearFault = () => post('/clear-fault')
export const resetSimulation = () => post('/reset')
