declare namespace JSX { interface IntrinsicElements { [elemName: string]: any } interface Element {} }
declare module "react" {
  export type ReactNode = any;
  export type CSSProperties = Record<string, string | number | undefined>;
  export type ChangeEvent<T = any> = { target: T; currentTarget: T };
  export type FormEvent<T = any> = { preventDefault(): void; target: T; currentTarget: T };
  export type KeyboardEvent<T = any> = any;
  export type MouseEvent<T = any> = any;
  export type PointerEvent<T = any> = any;
  export type DragEvent<T = any> = any;
  export type WheelEvent<T = any> = any;
  export type RefObject<T> = { current: T | null };
  export type SetStateAction<T> = T | ((previous: T) => T);
  export type Dispatch<T> = (value: T) => void;
  export function useState<T>(initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>];
  export function useState<T = undefined>(): [T | undefined, Dispatch<SetStateAction<T | undefined>>];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: readonly unknown[]): T;
  export function useRef<T>(initial: T): { current: T };
  export function useRef<T>(initial: T | null): { current: T | null };
  export function useRef<T = undefined>(): { current: T | undefined };
  export function createContext<T>(value: T): any;
  export function useContext<T>(context: any): T;
  export class Component<P = any, S = any> { constructor(props: P); props: P; state: S; setState(state: Partial<S>): void; render(): any; }
  const React: any; export default React;
}
declare module "react/jsx-runtime" { export const jsx: any; export const jsxs: any; export const Fragment: any; }
declare module "react-dom/client" { export function createRoot(element: Element | DocumentFragment): { render(node: any): void; unmount(): void }; }
declare module "vite/client" { }
declare module "vite" { export function defineConfig(config: any): any; }
declare module "vitest/config" { export function defineConfig(config: any): any; }
declare module "vitest" { export const describe: any; export const expect: any; export const it: any; export const test: any; export const beforeEach: any; export const afterEach: any; export const vi: any; }
declare module "@playwright/test" { export const test: any; export const expect: any; export type Page = any; export function defineConfig(config: any): any; export const devices: Record<string, any>; }
declare module "pdfjs-dist" { export const GlobalWorkerOptions: any; export function getDocument(options: any): any; export type PDFDocumentProxy = any; export type PDFPageProxy = any; export type TextContent = any; }
declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" { const value: string; export default value; }
declare module "mupdf" { const value: any; export = value; export default value; export const PDFDocument: any; export const Document: any; export const Matrix: any; }
declare module "tesseract.js" { const value: any; export default value; export const createWorker: any; export const PSM: any; }
interface ImportMetaEnv { readonly VITE_SOURCE_URL?: string; readonly VITE_BUILD_TIMESTAMP?: string; readonly VITE_RELEASE_CHANNEL?: "release-candidate" | "stable"; readonly BASE_URL?: string; }
interface ImportMeta { readonly env: ImportMetaEnv; }
declare namespace JSX { interface IntrinsicAttributes { key?: any } }
declare module "react" { export type ErrorInfo = any; export const StrictMode: any; export function memo<T>(value: T): T; }
declare module "pdfjs-dist" { export type RenderTask = any; }
