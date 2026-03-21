// Navigation link structure for Header.astro
// Edit this file to change the site's navigation menu.

export interface NavDropdownItem {
  label: string;
  href: string;
  desc?: string;
}

export interface NavLink {
  label: string;
  href: string;
  avatar?: string;
  dropdown?: NavDropdownItem[];
}

// TODO: Customize navigation for your practice's services
export const navLinks: NavLink[] = [
  { label: 'About Us', href: '/about' },
  {
    label: 'Services',
    href: '/services',
    dropdown: [
      { label: 'General Dentistry', href: '/services/general-dentistry', desc: 'Cleanings, exams & preventive care' },
      { label: 'Cosmetic Dentistry', href: '/services/cosmetic-dentistry', desc: 'Veneers, whitening & smile makeovers' },
      { label: 'Dental Implants', href: '/services/dental-implants', desc: 'Permanent tooth replacement' },
      { label: 'Restorative Dentistry', href: '/services/restorative-dentistry', desc: 'Crowns, bridges & dentures' },
    ],
  },
  {
    label: 'Resources',
    href: '/blog',
    dropdown: [
      { label: 'Patient Blog', href: '/blog', desc: 'Education & treatment guides' },
      { label: 'Before & After', href: '/gallery', desc: 'Real patient results' },
      { label: 'FAQ', href: '/faq', desc: 'Common questions answered' },
      { label: 'Financing', href: '/financing', desc: 'Insurance & payment options' },
    ],
  },
];
