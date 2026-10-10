/**
 * Static copy for the public landing page ("/"). Events (upcoming and past), stats and merch prices come from
 * the database through the public API; this file holds only labels, copy and photos. Past-event and gallery
 * photos are free-licence Unsplash stand-ins (credits below); merch photos are the club's own product mockups.
 * Replace any photo by overwriting the file under public/media/ with the same name.
 * Merch videos: drop `<item>.mp4` into public/media/merch/; until then the poster image shows.
 */

export type NavLink = { id: SectionId; label: string };
export type SectionId = 'events' | 'past' | 'merch' | 'about' | 'gallery' | 'join';

export const navLinks: NavLink[] = [
  { id: 'events', label: 'Events' },
  { id: 'merch', label: 'Merch' },
  { id: 'about', label: 'About' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'join', label: 'Join' },
];

export const hero = {
  script: 'Skyline',
  title: 'Student Association',
  tagline: 'Many students, one horizon.',
  subline: 'Events, community and everything the club does — in one place.',
  primaryCta: { label: 'Explore events', href: '#events' },
  secondaryCta: { label: 'Join the club', href: '#join' },
};

/**
 * Photos for the past-events grid. Events have no image field, so these free-licence Unsplash stand-ins
 * (unsplash.com/license) are shown with the club's real past events from the database until its own photos
 * replace public/media/past/past-<n>.jpg. Sources: 1 ZbiLAi2BtiU · 2 LtE6W_JVTGc · 3 tqe1jIgyhhs · 4 mbGBTpCi5qQ ·
 * 5 2uX_7L_10rM · 6 FQqRVH1EVjg (unsplash.com/photos/<id>).
 */
export type PastPhoto = { image: string; alt: string };
export const pastPhotos: PastPhoto[] = [
  { image: '/media/past/past-5.jpg', alt: 'Students seated in a seminar hall facing a projector screen' },
  { image: '/media/past/past-3.jpg', alt: 'Fireworks above a concert stage and a packed crowd' },
  { image: '/media/past/past-1.jpg', alt: 'Folk dancers in bright traditional costumes performing outdoors' },
  { image: '/media/past/past-4.jpg', alt: 'A dancer in traditional costume performing a classical Indian dance on stage' },
  { image: '/media/past/past-2.jpg', alt: 'Crowd throwing coloured powder into the air at Holi' },
  { image: '/media/past/past-6.jpg', alt: 'Graduates in caps and gowns posing together' },
];

/** `price` is the fallback while the shop loads; the live price comes from GET /api/products (matched by `name`). */
export type MerchItem = { id: string; name: string; price: string; image: string; video: string; alt: string };
export const merch: MerchItem[] = [
  { id: 'tshirt', name: 'T-shirt', price: '₹499', image: '/media/merch/tshirt.jpg', video: '/media/merch/tshirt.mp4', alt: 'Black T-shirt with the orange Skyline logo on the chest' },
  { id: 'bag', name: 'Bag', price: '₹299', image: '/media/merch/bag.jpg', video: '/media/merch/bag.mp4', alt: 'White tote bag with the orange Skyline logo' },
  { id: 'bottle', name: 'Water bottle', price: '₹399', image: '/media/merch/bottle.jpg', video: '/media/merch/bottle.mp4', alt: 'Black sports bottle with the orange Skyline logo' },
  { id: 'stickers', name: 'Stickers', price: '₹99', image: '/media/merch/stickers.jpg', video: '/media/merch/stickers.mp4', alt: 'Skyline logo sticker' },
];
export const merchShopHref = '/shop';

export const about = {
  paragraph:
    'Skyline Student Association is run by students, for students. We host the events that fill the campus calendar, manage events on behalf of the college, run memberships, and keep the club’s books in order.',
  features: [
    { icon: 'ticket', title: 'Host events', body: 'Venues, ticketing and QR check-in at the door.' },
    { icon: 'clipboard', title: 'Manage events for the college', body: 'Planning, volunteers and budgets, end to end.' },
    { icon: 'scale', title: 'Accountable books', body: 'Every rupee tracked in an append-only ledger.' },
  ] as const,
};

/** Landing stats: labels here, numbers from GET /api/stats (counted from the database). */
export type StatKey = 'events_hosted' | 'members' | 'students' | 'tickets_issued';
export type Stat = { key: StatKey; label: string; value: number; prefix?: string; suffix?: string; decimals?: number };
export const statLabels: { key: StatKey; label: string }[] = [
  { key: 'events_hosted', label: 'Events hosted' },
  { key: 'members', label: 'Active members' },
  { key: 'students', label: 'Students signed up' },
  { key: 'tickets_issued', label: 'Tickets issued' },
];

export type GalleryPhoto = { image: string; alt: string };
/** Free-licence Unsplash stand-ins (unsplash.com/license) until the club's own photos replace public/media/gallery/moment-<n>.jpg. */
export const gallery: GalleryPhoto[] = [
  'Fest crowd under a canopy of coloured streamers',
  'Night fest on campus with a packed crowd',
  'A huge crowd gathered for a campus event',
  'Students cheering at an evening concert',
  'Tricolour canopy over a festive gathering',
  'Students in traditional sarees on campus',
  'Students working through a written round',
  'Holi celebrations with coloured powder',
  'Two dancers in traditional costume under festival lights',
  'Classical dancers performing outdoors',
  'A student speaking at a campus talk',
  'Diyas lit for Diwali',
].map((alt, i) => ({ image: `/media/gallery/moment-${i + 1}.jpg`, alt }));

export const join = {
  script: 'join',
  title: 'Skyline',
  benefits: ['member ticket prices', 'merch discounts', 'vote in club decisions'],
};

export const socials = [
  { label: 'Instagram', icon: 'instagram', href: '#' },
  { label: 'LinkedIn', icon: 'linkedin', href: '#' },
  { label: 'YouTube', icon: 'youtube', href: '#' },
  { label: 'Email', icon: 'mail', href: 'mailto:ssa@example.com' },
] as const;
