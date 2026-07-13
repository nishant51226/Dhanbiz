import clsx from 'clsx';
import Heading from '@theme/Heading';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'Administrator guide',
    description: (
      <>
        Users, dynamic roles, subscription plans, notifications, and reports. Start with{' '}
        <Link to="/docs/admin/overview">Admin overview</Link>.
      </>
    ),
  },
  {
    title: 'Staff workflows',
    description: (
      <>
        Customers, jobs, files, and settings for practice staff. See{' '}
        <Link to="/docs/staff/dashboard">Staff dashboard</Link>.
      </>
    ),
  },
  {
    title: 'Customer portal',
    description: (
      <>
        Drive uploads, jobs, and portal roles for client contacts. Read the{' '}
        <Link to="/docs/customer-portal/overview">Portal overview</Link>.
      </>
    ),
  },
];

function Feature({title, description}) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
