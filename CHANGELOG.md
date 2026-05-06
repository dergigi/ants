# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Support for viewing Nostr follow packs (kind 39089) with `is:followpack` search shortcut

## [0.2.7] - 2025-11-23

### Added
- `/kinds` command to list is: shortcuts mapping to nostr kinds
- Version and commit hash to `/help` output
- Clickable links for version and commit in help output

### Changed
- Moved version and commit to end of help output on one line

### Fixed
- Reorder `/kinds` command to appear after `/examples` in help text
- Update `/kinds` command description to 'List kind mappings'
- Resolve linting issues in SearchView
- Use full commit hash for GitHub URL while displaying short hash

## [0.2.6] - 2025-11-23

### Added
- Support for NIP-05 domain profile searches

### Changed
- Refactored search utilities into focused modules
- Improved search controller organization

### Removed
- Unused streaming wrapper

## [0.2.5] - 2025-11-23

### Added
- Nostr filter reducer for smarter request optimization
- Query inspector showing reduced filters on hover and in expandable panel

### Changed
- Collapse hashtag and author OR into single filter

### Fixed
- Correct has:image replacement expansion
- Avoid spurious residual search text for structured OR queries

## [0.2.4] - 2025-11-22

### Added
- Share button next to chronological order button
- Dropdown menu to share button with Copy URL and Share With options
- Open with njump.to button next to mobile icon
- Phone icon to Native App menu item
- njump.to to nostr gateways list
- Make njump.to the default gateway (first in list)
- Make relay indicator clickable to open event on njump.to

### Changed
- Move show raw JSON button into three-dot menu
- Reorder menu items - raw JSON above web client with separator
- Replace open in native app icon with mobile icon
- Use mobile-screen-button icon for open in native app
- Update share button to match other small button styles
- Simplify ShareButton using IconButton and DRY principles
- Match share icon color to clock icon

### Fixed
- Handle naddr identifiers to prevent redirect loop
- Remove unused showRaw parameter from ProfileCreatedAt
- Add vertical overflow handling for menu positioning
- Change 'Share With...' to 'Share with...'
- Use const for top variable (lint fix)
- Position share menu closer to button (1px gap instead of 4px)
- Position share button to the left of chronological order button
- Remove click functionality from RelayIndicator

## [0.2.3] - 2025-11-03

### Added
- Sort dropdown for non-profile search results

### Changed
- Replace sort text with clock + arrow icons
- Change sort dropdown to toggle button, left-align
- Extract and apply purple favicon as app logo and favicon
- Update favicons and icons to blue logo theme
- Use SVG favicon (ant-blue.svg) with PNG fallbacks

### Fixed
- Use arrow-up-short-wide icon for oldest sort order
- Use arrow-down-wide-short icon for newest sort order
- Update sort button tooltip to show current state
- Remove conflicting favicon.ico from app directory
- Use gray/blue SVG logos based on login state

## [0.2.2] - 2025-11-03

### Added
- Date filters with `since:` and `until:` query syntax for time-based searches
- Date filter examples to search examples list
- Exact date tooltips to relative timestamps
- Date filter example documentation in README

### Fixed
- Exclude advancednostrsearch from TypeScript checking

## [0.2.1] - 2025-10-24

### Added
- Three-dot menu to profile cards for portal access
- Visual separators in portal menus between portals and client options
- Consistent portal menu styling across ProfileCard and EventCard components
- Ants logo image for branding

### Changed
- Improved menu organization and user experience
- Portal menus now have clear visual hierarchy separating portal websites from client options
- Reorganized search examples for better UX
- Unified command output styling

### Removed
- Redundant external button from profile cards (replaced by three-dot menu)

### Fixed
- Resolved TypeScript and ESLint issues in ProfileCard component
- Fixed scope issues with portal menu state variables
- Updated TypeScript types for menuButtonRef to handle null values
- Use proper NIP-19 nevent encoding for portal links
- Use full noteIDs in portal links instead of shortened ones
- Resolved linter warnings
- Properly handle help command with descriptions
- Extract command from clickable help list
- Show descriptions in help command output
- Use nightOwl theme background for command output
- Use dynamic command text for examples display
- Update tutorial command to use updateSearchQuery
- Update CLI command formats for slash commands
- Update help command display
- Remove handleSearch from useMemo dependency array

## [0.2.0] - 2025-10-24

### Added
- Portal menu functionality for event cards
- GPG commit signing setup and verification
- Various portal explorers and client options
- 10s timeout for Vertex DVM queries
- is:media filter for all media types
- NoteHeader on /p profile pages with search integration
- /tutorial slash command
- Clickable help command list with descriptions
- NIP-05 display in login message
- Spinners throughout app to replace loading text
- Code search functionality (kind:1337/1617)
- GitHub repository integration for code snippets
- Syntax highlighting with PrismJS and Darcula theme
- License display for code snippets
- Filename extraction from name, f, and title tags
- Direct tag subscription for license:VALUE queries
- Profile scope menu with three-dot functionality
- Media type filtering (has:image, has:video, etc.)
- Query translation with debouncing
- Parent chain rendering for threaded conversations
- Kind search mappings from replacements.txt
- Relay status indicators and connection management

### Changed
- Improved code organization and component structure
- Moved three-dot menu from ProfileCard to ProfileScopeIndicator
- Cleaned up has:image filter to exclude animated formats
- Unified command output styling
- Simplified Darcula theme integration
- Reorganized references into dedicated section
- Moved default kinds to constants
- Moved query translation logic to QueryTranslation component
- Simplified eventKindSearch to reuse existing loadRules
- Load kind search mappings dynamically from replacements.txt
- Simplified parent chain rendering approach
- Simplified kind button tooltip to show only search query
- Use IconButton for external link to ensure consistency
- Profile card styling with rounded corners
- Search result organization and display

### Fixed
- Clear DVM in-memory cache when using /clear command
- Properly cache Vertex credit errors and detect all error statuses
- Correct DVM subscription filter to use event reference tag
- Validate blurhash length before rendering
- Make profile scope menu scroll with page
- Scope menu builds proper by: identifier and /p URL
- Resolve linting and TypeScript issues
- Hide NoteHeader for profile results (kind:0)
- Keep p: tokens intact in OR expansion
- Remove duplicate 'has:video' to avoid duplicate keys
- Match relay count text color to blue icon when connected
- Clear all caches on login/logout to prevent stale profile resolution
- Load Java syntax highlighting (prism-java); keep Dart fallback
- Add Dart language support using JavaScript highlighting as fallback
- Remove unused snippetName variable and function from CodeSnippet
- Various performance optimizations and bug fixes

## [0.0.4] - Previous Release

### Added
- Initial portal functionality
- Basic event card structure
- Core search functionality
- Basic UI components
- Relay connection management
- Profile display functionality

### Changed
- Foundation improvements
- Basic component architecture

### Fixed
- Initial bug fixes and stability improvements

## [0.0.3] - Previous Release

### Added
- Core application features
- Basic Nostr integration
- Search functionality
- Event rendering

### Changed
- Improved application structure

## [0.0.2] - Previous Release

### Added
- Basic functionality
- Initial UI components
- Basic search capabilities

## [0.0.1] - Initial Release

### Added
- Initial project setup
- Basic application structure
- Foundation components
