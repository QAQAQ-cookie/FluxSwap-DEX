import { redirect } from 'next/navigation';

export default function PoolTradeRedirectPage() {
  redirect('/pool/transactions');
}
