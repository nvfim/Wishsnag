import { useEffect } from 'react';
import { useApp } from '@/ui/app/AppContext';
import { Layout } from './Layout';
import { navigate, useRoute } from './router';
import { Home } from './routes/Home';
import { Wishlist } from './routes/Wishlist';
import { Collections } from './routes/Collections';
import { PriceDrops } from './routes/PriceDrops';
import { FindCheaper, PriceHistory } from './routes/Pickers';
import { Insights } from './routes/Insights';
import { SettingsPage } from './routes/Settings';
import { ItemDetail } from './routes/ItemDetail';
import { AddProduct } from './routes/AddProduct';
import { ImportPage } from './routes/Import';
import { NotificationsPage } from './routes/Notifications';
import { Welcome } from './routes/Welcome';

export function Dashboard() {
  const route = useRoute();
  const { settings, t } = useApp();
  const [first, second] = route.segments;

  useEffect(() => {
    if (!settings.onboarded && !first) navigate('/welcome');
  }, [settings.onboarded, first]);

  useEffect(() => {
    document.title = `WishSnag — ${t('tagline')}`;
  }, [t]);

  let page: React.ReactNode;
  switch (first) {
    case undefined:
      page = <Home />;
      break;
    case 'wishlist':
      page = <Wishlist route={route} />;
      break;
    case 'collections':
      page = <Collections route={route} />;
      break;
    case 'drops':
      page = <PriceDrops />;
      break;
    case 'compare':
      page = <FindCheaper route={route} />;
      break;
    case 'history':
      page = <PriceHistory route={route} />;
      break;
    case 'insights':
      page = <Insights />;
      break;
    case 'settings':
      page = <SettingsPage />;
      break;
    case 'item':
      page = second ? <ItemDetail key={second} id={second} route={route} /> : <Wishlist route={route} />;
      break;
    case 'add':
      page = <AddProduct route={route} />;
      break;
    case 'import':
      page = <ImportPage />;
      break;
    case 'notifications':
      page = <NotificationsPage />;
      break;
    case 'welcome':
      page = <Welcome />;
      break;
    default:
      page = <Home />;
  }
  return <Layout route={route}>{page}</Layout>;
}
