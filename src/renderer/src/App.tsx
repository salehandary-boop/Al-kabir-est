import { useState } from 'react'
import { BoqPage } from './BoqPage'
import { ProjectsPage } from './ProjectsPage'

export function App() {
  const [projectId, setProjectId] = useState<number>()
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  return (
    <main>
      <header>
        <h1>AL KABIR EST</h1>
        <span>Construction estimation</span>
      </header>
      {error && (
        <div className="error" onClick={() => setError(undefined)}>
          {error} <span className="muted">(click to dismiss)</span>
        </div>
      )}
      {notice && (
        <div className="notice" onClick={() => setNotice(undefined)}>
          {notice} <span className="muted">(click to dismiss)</span>
        </div>
      )}
      {projectId ? (
        <BoqPage projectId={projectId} onBack={() => setProjectId(undefined)} onError={setError} onNotice={setNotice} />
      ) : (
        <ProjectsPage onOpen={setProjectId} onError={setError} />
      )}
    </main>
  )
}
