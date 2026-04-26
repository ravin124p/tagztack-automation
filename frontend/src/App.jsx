import { useEffect, useState } from 'react';
import OpSidebar from './components/OpSidebar.jsx';
import OpHeader from './components/OpHeader.jsx';
import TagsView from './components/TagsView.jsx';
import AutomationTestingView from './components/AutomationTestingView.jsx';

export default function App() {
  const [url, setUrl] = useState('https://example.com');
  const [isCapturing, setIsCapturing] = useState(false);
  const [captures, setCaptures] = useState([]);
  const [activeCaptureId, setActiveCaptureId] = useState(null);
  const [activeCapture, setActiveCapture] = useState(null);
  const [activeNav, setActiveNav] = useState('tag-inventory');

  useEffect(() => { loadCaptures(); }, []);

  useEffect(() => {
    if (activeCaptureId == null) {
      setActiveCapture(null);
      return;
    }
    fetch(`/api/captures/${activeCaptureId}`)
      .then((r) => r.json())
      .then((data) => setActiveCapture(data));
  }, [activeCaptureId]);

  async function loadCaptures() {
    const res = await fetch('/api/captures');
    const data = await res.json();
    setCaptures(data);
    if (data.length > 0 && activeCaptureId == null) {
      setActiveCaptureId(data[0].id);
      setUrl(data[0].url);
    }
  }

  async function runCapture() {
    if (!url || isCapturing) return;
    setIsCapturing(true);
    try {
      const res = await fetch('/api/captures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.id) {
        await loadCaptures();
        setActiveCaptureId(data.id);
      } else if (data.error) {
        alert(`Capture failed: ${data.error}`);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsCapturing(false);
    }
  }

  async function deleteCapture(id) {
    await fetch(`/api/captures/${id}`, { method: 'DELETE' });
    if (activeCaptureId === id) setActiveCaptureId(null);
    loadCaptures();
  }

  return (
    <div className="op-app">
      <OpHeader
        capture={activeCapture}
        captures={captures}
        activeCaptureId={activeCaptureId}
        onSelectCapture={(id) => {
          setActiveCaptureId(id);
          const c = captures.find((x) => x.id === id);
          if (c) setUrl(c.url);
        }}
        onDeleteCapture={deleteCapture}
        onNewCaptureClick={() => {
          const el = document.querySelector('.op-capture-bar-input');
          if (el) el.focus();
        }}
      />

      <div className="op-body">
        <OpSidebar activeNav={activeNav} onNavChange={setActiveNav} />

        <div className="op-main">
          {activeNav === 'tag-inventory' ? (
            <TagsView
              capture={activeCapture}
              urlInput={url}
              setUrlInput={setUrl}
              isCapturing={isCapturing}
              onCaptureRequested={runCapture}
            />
          ) : (
            <AutomationTestingView
              capture={activeCapture}
              urlInput={url}
              setUrlInput={setUrl}
              isCapturing={isCapturing}
              onCaptureRequested={runCapture}
            />
          )}
        </div>
      </div>
    </div>
  );
}
