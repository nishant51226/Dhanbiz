// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: '3K Financial Help',
  tagline: 'Administrator, staff, and customer portal user guide',
  favicon: 'img/brand-logo.png',
  future: {
    v4: true,
  },
  url: 'https://localhost',
  baseUrl: '/document/',
  organizationName: '3k-financial',
  projectName: '3khelp',
  onBrokenLinks: 'warn',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          routeBasePath: 'docs',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],
  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/docusaurus-social-card.jpg',
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: '3K Financial Help',
        logo: {
          alt: '3K Financial — Keeping Klient Knowledgeable',
          src: 'img/brand-logo.png',
          width: 36,
          height: 36,
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docsSidebar',
            position: 'left',
            label: 'Documentation',
          },
          {
            href: '/',
            position: 'right',
            label: 'Back to app',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Guides',
            items: [
              {label: 'Getting started', to: '/docs/getting-started'},
              {label: 'Staff guide', to: '/docs/staff/dashboard'},
              {label: 'Customer portal', to: '/docs/customer-portal/overview'},
            ],
          },
          {
            title: 'Administration',
            items: [
              {label: 'Admin overview', to: '/docs/admin/overview'},
              {label: 'Roles & permissions', to: '/docs/roles-permissions'},
              {label: 'Quality assurance', to: '/docs/qa/overview'},
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} 3K Financial & Accounting Services.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
