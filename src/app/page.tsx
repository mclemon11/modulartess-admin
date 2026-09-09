import styles from './page.module.css';

const scope = [
  { label: 'Autenticación y autorización', value: 'pendiente' },
  { label: 'Contrato OpenAPI con el backend', value: 'pendiente' },
  { label: 'Catálogo, pedidos e inventario', value: 'pendiente' },
  { label: 'Acceso directo a Firestore o Cloud Storage', value: 'no aplica' },
] as const;

export default function HomePage() {
  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Modulartess Admin</p>
        <h1 className={styles.title}>Panel administrativo en configuración</h1>
        <p className={styles.description}>
          Este repositorio contiene la base técnica del panel administrativo privado de Modulartess.
          Todavía no expone funcionalidad operativa: el backend NestJS es la autoridad de datos y de
          reglas comerciales.
        </p>
        <ul className={styles.list}>
          {scope.map((entry) => (
            <li className={styles.item} key={entry.label}>
              <span className={styles.itemLabel}>{entry.label}</span>
              <span className={styles.itemValue}>{entry.value}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
