'use client';

import { useRef, useState } from 'react';

import { IMAGE_MAX_ACTIVE } from '@/lib/api/image-limits';
import { VARIANT_MAX_ACTIVE } from '@/lib/api/variant-limits';

import styles from './catalog.module.css';
import { IMAGE_ANCHORS } from './product-anchors';
import { SECTION_IDS } from './publication-readiness';

/**
 * Guía para administrar un producto.
 *
 * Vive en un `<dialog>` nativo, y esa elección es lo que resuelve la accesibilidad sin librerías:
 * `showModal()` mueve el foco dentro y lo retiene, `Escape` cierra sin que haya que escucharlo, y
 * el resto de la página queda inerte mientras está abierta. Un `<div role="dialog">` habría
 * exigido reimplementar las tres cosas, que es de donde salen las trampas de foco rotas.
 *
 * Reglas que **no** son de estilo:
 *
 *   - No se abre sola. Aparece solo si se pulsa el botón, y se puede volver a abrir siempre.
 *   - No guarda nada. Ni `localStorage`, ni `sessionStorage`, ni cookies, ni un «ya la vi». No hay
 *     progreso que recordar porque no es un recorrido: es un texto que se consulta.
 *   - Los enlaces llevan a anclas **que existen** en la pantalla desde la que se abre. Al pulsar
 *     uno, la guía se cierra: dejarla abierta encima de la sección a la que acaba de llevar sería
 *     tapar justo lo que se quería ver.
 *   - El único `h1` de la pantalla es el título del producto. Aquí dentro se empieza en `h2`.
 */
export function ProductGuide({ mode }: { readonly mode: 'create' | 'edit' }) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [open, setOpen] = useState(false);

  function show() {
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function hide() {
    setOpen(false);
    dialogRef.current?.close();
  }

  return (
    <>
      <button className={styles.buttonSecondary} onClick={show} type="button">
        Ver guía para crear un producto
      </button>

      <dialog
        aria-labelledby="guia-producto-titulo"
        className={styles.guideDialog}
        onClose={() => setOpen(false)}
        ref={dialogRef}
      >
        <div className={styles.guideHeader}>
          <h2 className={styles.guideTitle} id="guia-producto-titulo">
            Guía para crear un producto
          </h2>
          {/*
            Nombre accesible explícito: el aspa sola no dice nada a un lector de pantalla, y
            `aria-label` en un botón con texto visible se contradiría con lo que se lee.
          */}
          <button className={styles.buttonSecondary} onClick={hide} type="button">
            Cerrar guía
          </button>
        </div>

        {open ? <GuideBody mode={mode} onNavigate={hide} /> : null}
      </dialog>
    </>
  );
}

/**
 * El contenido de la guía.
 *
 * Está fuera del `<dialog>` como función propia para poder renderizarlo en una prueba sin DOM: lo
 * que hay que comprobar es lo que dice y a dónde enlaza, no si el navegador abre el diálogo.
 */
export function GuideBody({
  mode,
  onNavigate,
}: {
  readonly mode: 'create' | 'edit';
  readonly onNavigate?: () => void;
}) {
  return (
    <div className={styles.guideBody}>
      <p className={styles.guideLead}>
        {mode === 'create'
          ? 'Todo lo de esta pantalla se envía de una vez al pulsar «Crear producto». Nada se guarda antes.'
          : 'Cada bloque de esta ficha se guarda por su cuenta: el contenido, el inventario, las imágenes y las variantes son operaciones distintas.'}
      </p>

      <GuideSection
        anchor={SECTION_IDS.basica}
        onNavigate={onNavigate}
        title="1. Información básica"
      >
        <p>
          Nombre, SKU, slug y precio. El SKU y el slug son <strong>inmutables</strong>: el backend
          no los deja cambiar después, ni reutiliza los de algo archivado. El precio va en pesos
          enteros; los centavos no existen en COP.
        </p>
      </GuideSection>

      <GuideSection
        anchor={SECTION_IDS.clasificacion}
        onNavigate={onNavigate}
        title="2. Clasificación y descripción"
      >
        <p>
          La categoría y el tipo se escriben a mano —nombre y slug— porque el contrato todavía no
          publica una lista de la que elegirlos. La descripción corta es la frase que acompaña al
          producto en la tienda; la detallada cuenta materiales, medidas, garantía y cuidados.
        </p>
      </GuideSection>

      <GuideSection
        anchor={SECTION_IDS.inventario}
        onNavigate={onNavigate}
        title="3. Los dos modos de inventario"
      >
        <p>
          <strong>Controlar cantidad</strong>: escribes cuántas unidades hay. Siempre el total,
          nunca la diferencia: para pasar de 8 a 15 escribes 15, y para agotarlo escribes 0. El
          umbral de stock bajo es el aviso, no un mínimo de venta.
        </p>
        <p>
          <strong>Solo disponibilidad</strong>: eliges «Con existencias» o «Sin existencias» y ya
          está. <strong>No lleva cantidad</strong> ni umbral, y no se guarda ningún número
          escondido: el estado se cambia a mano cuando haga falta.
        </p>
        <p>
          Cambiar de modo pide una confirmación, porque cambia qué significa el inventario, no solo
          su valor.
        </p>
      </GuideSection>

      <GuideSection
        anchor={SECTION_IDS.variantes}
        onNavigate={onNavigate}
        title="4. Inventario por variantes"
      >
        <p>
          En cuanto el producto tiene una variante activa, lo que se vende es el inventario de cada
          variante. El valor base <strong>no se borra</strong>, pero deja de gobernar, y por eso la
          ficha deja de ofrecer su edición y dice «Inventario gestionado por variantes».
        </p>
        <p>Cada variante elige su modo por separado: unas con conteo y otras por disponibilidad.</p>
      </GuideSection>

      <GuideSection
        anchor={IMAGE_ANCHORS.portada}
        onNavigate={onNavigate}
        title="5. Portada y Galería"
      >
        <p>
          La <strong>portada</strong> es la primera imagen que aparece en la tienda y en la ficha:
          una sola, la que abre el producto. La <strong>galería</strong> son todas las demás, en el
          orden en que se verán.
        </p>
        <p>
          Si el producto aún no tiene portada, agrégala antes que la galería: la primera imagen que
          recibe el backend se marca como principal, y elegirla desde «Galería» la habría decidido
          sin decírtelo. Al cambiar la portada, la anterior <strong>sigue activa</strong> en la
          galería: no se archiva sola.
        </p>
        <p>
          Caben {IMAGE_MAX_ACTIVE} imágenes activas contando la portada. Elegir archivos{' '}
          <strong>no los sube</strong>: se suben con «Subir N imágenes», una detrás de otra, y si
          una falla el resto se queda esperando sin reenviar las que ya subieron.
        </p>
        <p>
          <strong>Las imágenes son opcionales para publicar.</strong> El contrato no las exige; que
          un producto se vea mejor con ellas es otra cosa.
        </p>
      </GuideSection>

      <GuideSection
        anchor={IMAGE_ANCHORS.galeria}
        onNavigate={onNavigate}
        title="6. Texto alternativo"
      >
        <p>
          Es obligatorio en cada imagen y describe lo que se ve, para quien no puede verla y para
          cuando la imagen no carga. No es el nombre del archivo ni una lista de palabras clave.
        </p>
        <p>
          Ejemplo: <em>«Clóset Vitria en madera, visto de frente con puertas abiertas»</em>. Cada
          imagen lleva el suyo: copiar el mismo a todas no describe ninguna.
        </p>
      </GuideSection>

      <GuideSection anchor={SECTION_IDS.variantes} onNavigate={onNavigate} title="7. Variantes">
        <p>
          Una variante es un artículo vendible de verdad, con su{' '}
          <strong>propio SKU, su precio y su inventario</strong>. Un color que solo hay que
          mencionar va en «Detalles adicionales»: convertirlo en variante crea algo que nadie puede
          comprar.
        </p>
        <p>
          Cada variante lleva exactamente los ejes que el producto declara, ni uno más ni uno menos,
          y caben {VARIANT_MAX_ACTIVE} activas.
        </p>
      </GuideSection>

      <GuideSection
        anchor={SECTION_IDS.basica}
        onNavigate={onNavigate}
        title="8. Checklist y publicación"
      >
        <p>
          <strong>Guardar no publica.</strong> Un producto nace en borrador y sigue en borrador
          hasta que se pulsa «Publicar producto».
        </p>
        <p>
          La lista de lo que falta para publicar <strong>la calcula el backend</strong> y llega en
          cada respuesta: el panel la muestra tal cual y no inventa requisitos ni los adelanta.
        </p>
      </GuideSection>
    </div>
  );
}

/** Un apartado de la guía, con su enlace al bloque real de la pantalla. */
function GuideSection({
  title,
  anchor,
  onNavigate,
  children,
}: {
  readonly title: string;
  readonly anchor: string;
  readonly onNavigate?: (() => void) | undefined;
  readonly children: React.ReactNode;
}) {
  return (
    <section className={styles.guideSection}>
      <h3 className={styles.guideSectionTitle}>{title}</h3>
      {children}
      <a className={styles.guideLink} href={`#${anchor}`} onClick={onNavigate}>
        Ir a esta sección
      </a>
    </section>
  );
}
