import { lookupVertexProfile } from './vertex';

describe('Vertex Profile Lookup', () => {
  it('should find fiatjaf profile', async () => {
    const profile = await lookupVertexProfile('p:fiatjaf');
    expect(profile).not.toBeNull();
    if (profile) {
      expect(profile.pubkey).toBe('3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d');
      const content = JSON.parse(profile.content);
      expect(content.display_name || content.displayName || content.name).toBe('fiatjaf');
    }
  });
}); 