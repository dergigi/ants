import { NextResponse } from 'next/server';

const NIP05_DATA = {
  names: {
    _: 'e530f930efb36ec1da0f5f249ad3db8edf19b667570acab817c82185d562e889',
  },
  relays: {
    e530f930efb36ec1da0f5f249ad3db8edf19b667570acab817c82185d562e889: [
      'wss://relay.damus.io',
      'wss://relay.primal.net',
      'wss://nos.lol',
      'wss://purplepag.es',
      'wss://haven.dergigi.com',
      'wss://wot.dergigi.com',
    ],
  },
};

export async function GET() {
  return NextResponse.json(NIP05_DATA, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
