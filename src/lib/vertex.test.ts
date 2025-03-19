import { lookupVertexProfile, VERTEX_REGEXP } from './vertex';
import { beforeAll } from '@jest/globals';
import { connect } from './ndk';

beforeAll(async () => {
  await connect();
});

describe('Vertex Profile Lookup', () => {
  it('should find fiatjaf profile', async () => {
    const profile = await lookupVertexProfile('p:fiatjaf');
    expect(profile).toBeTruthy();
    expect(profile?.pubkey).toBe('3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d');
  });

  it('should find gigi profile', async () => {
    const profile = await lookupVertexProfile('p:gigi');
    expect(profile).toBeTruthy();
    expect(profile?.pubkey).toBe('6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93');
  });

  it('should return null for non-existent profile', async () => {
    const profile = await lookupVertexProfile('p:nonexistentuser123456789');
    expect(profile).toBeNull();
  });

  it('should return null for invalid query format', async () => {
    const profile = await lookupVertexProfile('invalid:query');
    expect(profile).toBeNull();
  });
}); 