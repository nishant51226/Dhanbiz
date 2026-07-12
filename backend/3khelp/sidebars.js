// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    'intro',
    'getting-started',
    {
      type: 'category',
      label: 'Administrator guide',
      collapsed: false,
      items: [
        'admin/overview',
        'admin/user-management',
        'admin/roles-and-access',
        'admin/subscription-management',
        'admin/notifications',
        'admin/reports-and-audit',
        'admin/extraction-pipeline',
      ],
    },
    {
      type: 'category',
      label: 'Staff guide',
      items: [
        'staff/dashboard',
        'staff/customers',
        'staff/jobs',
        'staff/files',
        'staff/reports',
        'staff/settings',
      ],
    },
    {
      type: 'category',
      label: 'Customer portal',
      items: ['customer-portal/overview'],
    },
    {
      type: 'category',
      label: 'Quality assurance',
      items: [
        'qa/overview',
        'qa/checklists',
        'qa/troubleshooting',
        'qa/reporting-issues',
      ],
    },
    'roles-permissions',
  ],
};

export default sidebars;
