import { useState } from 'react';
import './App.css';
import type { ParseResponse, CharacterData } from './types';
import UploadPage from './components/UploadPage/UploadPage';
import CharacterSelect from './components/CharacterSelect/CharacterSelect';
import BuildPage from './components/BuildPage/BuildPage';

type View = 'upload' | 'select' | 'build';

export default function App() {
  const [view, setView] = useState<View>('upload');
  const [saveData, setSaveData] = useState<ParseResponse | null>(null);
  const [character, setCharacter] = useState<CharacterData | null>(null);

  function handleLoaded(data: ParseResponse) {
    setSaveData(data);
    const active = data.characters.filter(c => c.name && c.level > 0);

    if (active.length === 1) {
      setCharacter(active[0]);
      setView('build');
    } else if (active.length > 1) {
      setView('select');
    } else {
      // sin personajes activos — mostrar select igualmente
      setView('select');
    }
  }

  function handleSelectChar(char: CharacterData) {
    setCharacter(char);
    setView('build');
  }

  function handleBack() {
    if (view === 'build' && saveData) {
      const active = saveData.characters.filter(c => c.name && c.level > 0);
      if (active.length > 1) {
        setView('select');
        return;
      }
    }
    setView('upload');
    setSaveData(null);
    setCharacter(null);
  }

  if (view === 'upload') {
    return <UploadPage onLoaded={handleLoaded} />;
  }

  if (view === 'select' && saveData) {
    return (
      <CharacterSelect
        characters={saveData.characters}
        onSelect={handleSelectChar}
        onBack={() => { setView('upload'); setSaveData(null); }}
      />
    );
  }

  if (view === 'build' && character) {
    return <BuildPage character={character} onBack={handleBack} />;
  }

  // fallback
  return <UploadPage onLoaded={handleLoaded} />;
}
