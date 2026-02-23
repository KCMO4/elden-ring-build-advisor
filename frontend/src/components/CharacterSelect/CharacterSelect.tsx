import type { CharacterData } from '../../types';
import styles from './CharacterSelect.module.css';

interface Props {
  characters: CharacterData[];
  onSelect: (char: CharacterData) => void;
  onBack: () => void;
}

export default function CharacterSelect({ characters, onSelect, onBack }: Props) {
  const active = characters.filter(c => c.name && c.level > 0);

  return (
    <div className={styles.page}>
      <h2 className={styles.title}>Seleccionar Personaje</h2>
      <p className={styles.subtitle}>
        {active.length} personaje{active.length !== 1 ? 's' : ''} encontrado{active.length !== 1 ? 's' : ''}
      </p>

      <div className={styles.grid}>
        {active.map((char, i) => (
          <div key={i} className={styles.card} onClick={() => onSelect(char)}>
            <div className={styles.cardName} title={char.name}>{char.name}</div>
            <div className={styles.cardLevel}>Nivel {char.level}</div>
          </div>
        ))}
      </div>

      <button className={styles.backBtn} onClick={onBack}>
        ← Volver
      </button>
    </div>
  );
}
