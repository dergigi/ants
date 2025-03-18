import { lookupVertexProfile } from './vertex';
import { connect } from './ndk';

describe('Vertex Profile Lookup', () => {
  beforeAll(async () => {
    await connect();
  });

  it('should find fiatjaf profile', async () => {
    const profile = await lookupVertexProfile('p:fiatjaf');
    expect(profile).not.toBeNull();
    if (profile) {
      expect(profile.pubkey).toBe('3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d');
      const content = JSON.parse(profile.content);
      expect(content.display_name || content.displayName || content.name).toBe('fiatjaf');
    }
  }, 30000); // 30 second timeout
}); 