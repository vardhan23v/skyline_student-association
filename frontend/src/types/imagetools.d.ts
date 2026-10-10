/** vite-imagetools query imports used by src/data/backgrounds.ts. */
type ImagetoolsPicture = { sources: Record<'avif' | 'webp' | 'jpeg', string>; img: { src: string; w: number; h: number } };
declare module '*&as=picture' { const picture: ImagetoolsPicture; export default picture; }
declare module '*&inline' { const dataUrl: string; export default dataUrl; }
