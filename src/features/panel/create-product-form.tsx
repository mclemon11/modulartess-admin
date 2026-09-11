'use client';

import { useId, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { acquire, createOperationLock, release } from '@/features/auth/operation-lock';

import styles from './catalog.module.css';
import { describeCatalogFailure } from './catalog-errors';
import { createProduct } from './catalog-client';
import { SKU_PATTERN, SLUG_PATTERN } from './product-input';

type Errors = Partial<Record<'sku' | 'slug' | 'name' | 'priceCop', string>>;

/**
 * Formulario de alta.
 *
 * No ofrece elegir estado: el backend crea siempre en `draft`, y un selector que el servidor
 * ignora sería una mentira en pantalla. Tras crear, navega al detalle real que devuelve el
 * backend, no a uno construido a mano.
 */
export function CreateProductForm() {
  const router = useRouter();
  const lock = useRef(createOperationLock());
  const ids = {
    sku: useId(),
    slug: useId(),
    name: useId(),
    shortDescription: useId(),
    description: useId(),
    priceCop: useId(),
    stockQuantity: useId(),
    lowStockThreshold: useId(),
  };

  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);

  function validate(form: HTMLFormElement): Errors {
    const data = new FormData(form);
    const next: Errors = {};
    const sku = String(data.get('sku') ?? '').trim();
    const slug = String(data.get('slug') ?? '').trim();
    const name = String(data.get('name') ?? '').trim();
    const price = Number(data.get('priceCop'));

    if (!SKU_PATTERN.test(sku)) {
      next.sku = 'Solo mayúsculas, números y guiones. Entre 2 y 64 caracteres.';
    }

    if (!SLUG_PATTERN.test(slug)) {
      next.slug = 'Solo minúsculas, números y guiones. Entre 2 y 64 caracteres.';
    }

    if (name.length === 0) {
      next.name = 'El nombre es obligatorio.';
    }

    if (!Number.isInteger(price) || price < 0) {
      next.priceCop = 'Pesos colombianos enteros, sin decimales ni separadores.';
    }

    return next;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!acquire(lock.current)) {
      return;
    }

    const form = event.currentTarget;
    const found = validate(form);

    setErrors(found);

    if (Object.keys(found).length > 0) {
      release(lock.current);
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();

      return;
    }

    setBusy(true);
    setFailure(null);

    const data = new FormData(form);
    const optional = (key: string) => {
      const value = String(data.get(key) ?? '').trim();

      return value.length === 0 ? undefined : value;
    };

    const result = await createProduct({
      sku: String(data.get('sku') ?? '').trim(),
      slug: String(data.get('slug') ?? '').trim(),
      name: String(data.get('name') ?? '').trim(),
      priceCop: Number(data.get('priceCop')),
      stockQuantity: Number(data.get('stockQuantity') ?? 0),
      lowStockThreshold: Number(data.get('lowStockThreshold') ?? 0),
      ...(optional('shortDescription') === undefined
        ? {}
        : { shortDescription: optional('shortDescription') }),
      ...(optional('description') === undefined ? {} : { description: optional('description') }),
    });

    if (result.ok) {
      // Salida terminal: se navega al detalle real que devolvió el backend.
      router.push(`/panel/productos/${result.data.id}`);

      return;
    }

    release(lock.current);
    setFailure(describeCatalogFailure(result.code));
    setBusy(false);
  }

  return (
    <form className={styles.cardPad} noValidate onSubmit={handleSubmit}>
      <div aria-live="assertive">
        {failure === null ? null : (
          <p className={styles.error} role="alert">
            {failure}
          </p>
        )}
      </div>

      <div className={styles.row}>
        <Field
          error={errors.sku}
          hint="Inmutable una vez creado. El backend lo pasa a mayúsculas."
          id={ids.sku}
          label="SKU"
          name="sku"
          required
        />
        <Field
          error={errors.slug}
          hint="Inmutable una vez creado. En minúsculas separadas por guiones."
          id={ids.slug}
          label="Slug"
          name="slug"
          required
        />
      </div>

      <Field error={errors.name} id={ids.name} label="Nombre" name="name" required />

      <div className={styles.field}>
        <label className={styles.label} htmlFor={ids.shortDescription}>
          Descripción corta
        </label>
        <input
          className={styles.input}
          id={ids.shortDescription}
          name="shortDescription"
          type="text"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={ids.description}>
          Descripción
        </label>
        <textarea className={styles.textarea} id={ids.description} name="description" />
      </div>

      <div className={styles.row}>
        <Field
          error={errors.priceCop}
          hint="Pesos enteros. COP no usa decimales."
          id={ids.priceCop}
          label="Precio (COP)"
          min={0}
          name="priceCop"
          required
          type="number"
        />
        <Field
          hint="Existencias con las que nace el producto."
          id={ids.stockQuantity}
          label="Stock inicial"
          min={0}
          name="stockQuantity"
          type="number"
        />
        <Field
          hint="Por debajo de este número, el listado lo marca."
          id={ids.lowStockThreshold}
          label="Umbral de stock bajo"
          min={0}
          name="lowStockThreshold"
          type="number"
        />
      </div>

      <p className={styles.notice}>
        El producto nace como <strong>borrador</strong>. No es visible en la tienda hasta que se
        publica, y publicar es una acción aparte.
      </p>

      <div className={styles.actions}>
        <button className={styles.button} disabled={busy} type="submit">
          {busy ? 'Creando…' : 'Crear producto'}
        </button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  name,
  hint,
  error,
  required,
  type = 'text',
  min,
}: {
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly required?: boolean | undefined;
  readonly type?: 'text' | 'number' | undefined;
  readonly min?: number | undefined;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const described = [hint === undefined ? null : hintId, error === undefined ? null : errorId]
    .filter((value): value is string => value !== null)
    .join(' ');

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required ? ' *' : ''}
      </label>
      <input
        className={error === undefined ? styles.input : styles.inputInvalid}
        id={id}
        name={name}
        type={type}
        {...(min === undefined ? {} : { min })}
        {...(required === true ? { required: true } : {})}
        {...(error === undefined ? {} : { 'aria-invalid': true })}
        {...(described === '' ? {} : { 'aria-describedby': described })}
      />
      {hint === undefined ? null : (
        <span className={styles.hint} id={hintId}>
          {hint}
        </span>
      )}
      {error === undefined ? null : (
        <span className={styles.fieldError} id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}
