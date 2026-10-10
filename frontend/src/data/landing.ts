/**
 * All content for the public landing page ("/").
 * Everything here is PLACEHOLDER: photos are picsum.photos downloads saved under
 * public/media/{events,past,gallery,merch}/, numbers and prices are dummies.
 * Swap a photo by overwriting the file with the same name, or change the path here.
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

export type UpcomingEvent = { id: string; title: string; date: string; venue: string; image: string; alt: string; href: string };
/** `href` points at the real events list; replace with `/events/<id>` once these map to real events. */
export const upcomingEvents: UpcomingEvent[] = [
  { id: 'freshers', title: 'Freshers Night', date: '2026-10-24', venue: 'Main Quad', image: '/media/events/upcoming-1.jpg', alt: 'Crowd gathered under evening lights', href: '/events' },
  { id: 'open-mic', title: 'Open Mic: Unplugged', date: '2026-11-02', venue: 'Amphitheatre', image: '/media/events/upcoming-2.jpg', alt: 'Performer on a small stage', href: '/events' },
  { id: 'hackathon', title: '24h Skyline Hackathon', date: '2026-11-14', venue: 'CS Block, Lab 3', image: '/media/events/upcoming-3.jpg', alt: 'Students working on laptops late at night', href: '/events' },
  { id: 'diwali', title: 'Festival of Lights', date: '2026-11-20', venue: 'Central Lawn', image: '/media/events/upcoming-4.jpg', alt: 'Lamps and lights at dusk', href: '/events' },
  { id: 'sports', title: 'Inter-Hostel Sports Day', date: '2026-12-05', venue: 'Sports Complex', image: '/media/events/upcoming-5.jpg', alt: 'Athletes on an outdoor track', href: '/events' },
  { id: 'gala', title: 'Winter Gala', date: '2026-12-18', venue: 'Convention Hall', image: '/media/events/upcoming-6.jpg', alt: 'Decorated hall set for a formal evening', href: '/events' },
];

export type PastEvent = { title: string; date: string; image: string; alt: string };
export const pastEvents: PastEvent[] = [
  { title: 'Spring Fest 2026', date: '2026-03-14', image: '/media/past/past-1.jpg', alt: 'Spring Fest crowd' },
  { title: 'Battle of Bands', date: '2026-02-21', image: '/media/past/past-2.jpg', alt: 'Band performing at Battle of Bands' },
  { title: 'Startup Pitch Night', date: '2026-01-30', image: '/media/past/past-3.jpg', alt: 'Speaker presenting to an audience' },
  { title: 'Cultural Evening', date: '2025-12-12', image: '/media/past/past-4.jpg', alt: 'Dancers on stage' },
  { title: 'Charity Run', date: '2025-11-08', image: '/media/past/past-5.jpg', alt: 'Runners at the charity run' },
  { title: 'Alumni Meet', date: '2025-09-20', image: '/media/past/past-6.jpg', alt: 'Alumni talking in small groups' },
];

export type MerchItem = { id: string; name: string; price: string; image: string; video: string; alt: string };
export const merch: MerchItem[] = [
  { id: 'tshirt', name: 'T-shirt', price: '₹499', image: '/media/merch/tshirt.jpg', video: '/media/merch/tshirt.mp4', alt: 'Skyline T-shirt' },
  { id: 'bag', name: 'Bag', price: '₹699', image: '/media/merch/bag.jpg', video: '/media/merch/bag.mp4', alt: 'Skyline tote bag' },
  { id: 'bottle', name: 'Water bottle', price: '₹349', image: '/media/merch/bottle.jpg', video: '/media/merch/bottle.mp4', alt: 'Skyline water bottle' },
  { id: 'stickers', name: 'Stickers', price: '₹99', image: '/media/merch/stickers.jpg', video: '/media/merch/stickers.mp4', alt: 'Pack of Skyline stickers' },
];
export const merchShopHref = '/shop';

export const about = {
  paragraph:
    'Skyline Student Association is run by students, for students. We host the events that fill the campus calendar, manage events on behalf of the college, run memberships, and keep the club’s finances open for anyone to read.',
  features: [
    { icon: 'ticket', title: 'Host events', body: 'Venues, ticketing and QR check-in at the door.' },
    { icon: 'clipboard', title: 'Manage events for the college', body: 'Planning, volunteers and budgets, end to end.' },
    { icon: 'scale', title: 'Transparent club', body: 'Every rupee tracked in a public ledger.' },
  ] as const,
};

export type Stat = { label: string; value: number; prefix?: string; suffix?: string; decimals?: number };
export const stats: Stat[] = [
  { label: 'Events hosted', value: 48, suffix: '+' },
  { label: 'Members', value: 1200, suffix: '+' },
  { label: 'Volunteers', value: 85 },
  { label: 'Funds raised', value: 3.2, prefix: '₹', suffix: 'L', decimals: 1 },
];

export type GalleryPhoto = { image: string; alt: string };
export const gallery: GalleryPhoto[] = [
  'Stage lights at the cultural evening', 'Friends at the Spring Fest', 'Volunteers at the welcome desk', 'Night view of the campus',
  'Crowd cheering at the concert', 'Hackathon team celebrating', 'Lanterns at the Festival of Lights', 'Charity run start line',
  'Open mic performer', 'Committee group photo', 'Merch stall at Freshers', 'Fireworks after the gala',
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
