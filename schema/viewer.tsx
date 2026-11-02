/**
 * Schema Explorer (Preact) — runtime UI over schema/models.ts
 */
import { render } from 'preact'
import { App } from './App'

const root = document.getElementById('app')
if (!root) throw new Error('#app missing')
render(<App />, root)
