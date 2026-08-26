import { createFileRoute } from '@tanstack/react-router';
import { AssetsPage } from './assets';

export const Route = createFileRoute('/asset-manager')({
  component: AssetsPage,
});
