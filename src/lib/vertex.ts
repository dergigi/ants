import { ndk } from './ndk';
import { NDKEvent, NDKUser, NDKKind, NDKRelaySet, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { Event, getEventHash } from 'nostr-tools';
import { getStoredPubkey } from './nip07';

export const VERTEX_REGEXP = /^p:([a-zA-Z0-9_]+)$/;

// Create a specific relay set for the Vertex DVM
const dvmRelaySet = NDKRelaySet.fromRelayUrls(['wss://relay.vertexlab.io'], ndk);

interface VertexProfile {
  pubkey: string;
  name: string;
  display_name?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  lud16?: string;
  lud06?: string;
  website?: string;
  banner?: string;
}

async function queryVertexDVM(username: string): Promise<NDKEvent[]> {
  try {
    console.log('Starting DVM query for username:', username);
    const storedPubkey = getStoredPubkey();
    if (!storedPubkey) {
      throw new Error('Not logged in');
    }
    
    const requestId = Math.random().toString(36).substring(7);
    console.log('Generated requestId:', requestId);
    
    // Create a plain event first
    const plainEvent: Event = {
      kind: 5315,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['param', 'search', username],
        ['request_id', requestId]
      ],
      content: '',
      pubkey: storedPubkey,
      id: '',
      sig: ''
    };
    console.log('Created DVM request event:', plainEvent);

    // Get the event hash
    plainEvent.id = getEventHash(plainEvent);

    // Sign the event using nostr-tools
    if (!ndk.signer) {
      throw new Error('No signer available');
    }
    const signature = await ndk.signer.sign(plainEvent);
    plainEvent.sig = signature;
    console.log('Signed DVM request event:', { id: plainEvent.id, sig: signature.slice(0, 10) + '...' });

    // Create an NDKEvent from the signed event
    const requestEvent = new NDKEvent(ndk, plainEvent);
    console.log('Created NDK event for DVM request');

    return new Promise<NDKEvent[]>((resolve, reject) => {
      try {
        console.log('Setting up DVM subscription...');
        const sub = ndk.subscribe(
          [{ 
            kinds: [6315, 7000] as NDKKind[],
            ...requestEvent.filter()  // Include the request filter
          }],
          { 
            closeOnEose: false,
            cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY
          },
          dvmRelaySet
        );

        // Add event handlers after creating subscription
        sub.on('event', (event: NDKEvent) => {
          console.log('Received DVM event:', {
            kind: event.kind,
            id: event.id,
            tags: event.tags,
            content: event.content.slice(0, 100) + '...'
          });

          if (event.kind === 7000) {
            const statusTag = event.tags.find((tag: string[]) => tag[0] === 'status');
            const status = statusTag?.[2] ?? statusTag?.[1];
            if (status) {
              console.log('DVM status update:', status);
            }
            return;
          }

          // Stop subscription immediately when we get a valid response
          console.log('Got valid DVM response, stopping subscription');
          sub.stop();

          try {
            console.log('Parsing DVM response content...');
            const records = JSON.parse(event.content);
            console.log('Parsed records:', records);

            if (Array.isArray(records) && records.length > 0) {
              const record = records[0];
              if (record.pubkey) {
                console.log('Found valid profile record:', { 
                  pubkey: record.pubkey,
                  name: record.name || record.username,  // Try username if name isn't available
                  display_name: record.display_name || record.displayName,  // Try both formats
                  nip05: record.nip05
                });

                // Create an NDKUser object right away
                const user = new NDKUser({
                  pubkey: record.pubkey
                });

                // Set the profile metadata
                const profile = {
                  name: record.name || record.username,  // Try username if name isn't available
                  displayName: record.display_name || record.displayName,  // Try both formats
                  image: record.picture || record.image || record.avatar,  // Try all possible image fields
                  about: record.about || record.description,  // Try both formats
                  nip05: record.nip05,
                  lud16: record.lud16,
                  lud06: record.lud06,
                  website: record.website
                };

                // Filter out undefined values
                user.profile = Object.fromEntries(
                  Object.entries(profile).filter(([, value]) => value !== undefined)
                );

                // Create a profile event
                const profileEvent = new NDKEvent(ndk, {
                  kind: 0,
                  created_at: Math.floor(Date.now() / 1000),
                  content: JSON.stringify(record),
                  pubkey: record.pubkey,
                  tags: [],
                  id: '',
                  sig: ''
                });

                // Set the author
                profileEvent.author = user;
                console.log('Created profile event:', { 
                  id: profileEvent.id,
                  pubkey: profileEvent.pubkey,
                  author: profileEvent.author.pubkey,
                  profile: user.profile  // Log the profile data
                });

                resolve([profileEvent]);
              } else {
                console.log('No pubkey found in record:', record);
                reject(new Error('No pubkey in response'));
              }
            } else {
              console.log('No valid records found in response');
              reject(new Error('No results found'));
            }
          } catch (e) {
            console.error('Error parsing DVM response:', e);
            reject(e);
          }
        });

        sub.on('eose', () => {
          console.log('Got EOSE, publishing DVM request...');
          // Publish the request to the DVM relay set after we get EOSE
          requestEvent.publish(dvmRelaySet);
          console.log('Published DVM request:', { 
            id: requestEvent.id,
            kind: requestEvent.kind,
            tags: requestEvent.tags 
          });
        });
        
        console.log('Starting DVM subscription...');
        sub.start();
      } catch (e) {
        console.error('Error in subscription:', e);
        reject(e);
      }
    });
  } catch (error) {
    console.error('Error in queryVertexDVM:', error);
    throw error;
  }
}

export async function lookupVertexProfile(query: string): Promise<NDKEvent | null> {
  const match = query.match(VERTEX_REGEXP);
  if (!match) return null;
  
  const username = match[1].toLowerCase();
  
  try {
    const events = await queryVertexDVM(username);
    
    if (events.length === 0) {
      return null;
    }

    const response = events[0];
    let results: VertexProfile[];
    
    try {
      results = JSON.parse(response.content);
    } catch (e) {
      console.error('Error parsing Vertex DVM response:', e);
      return null;
    }

    if (!Array.isArray(results) || results.length === 0) {
      return null;
    }

    const profile = results[0];
    
    // Create an NDKUser object
    const user = new NDKUser({
      pubkey: profile.pubkey
    });

    // Set the profile metadata
    user.profile = {
      name: profile.name,
      displayName: profile.display_name,
      image: profile.picture,
      about: profile.about,
      nip05: profile.nip05,
      lud16: profile.lud16,
      lud06: profile.lud06,
      website: profile.website
    };

    // Create a profile event
    const profileEvent = new NDKEvent(ndk, {
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      content: JSON.stringify(profile),
      pubkey: profile.pubkey,
      tags: [],
      id: '',
      sig: ''
    });

    // Set the author
    profileEvent.author = user;

    return profileEvent;
  } catch (error) {
    console.error('Error in lookupVertexProfile:', error);
    return null;
  }
} 