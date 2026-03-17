# OmniFocus ↔ Reclaim.ai Sync Plugin

Bidirectional synchronization between OmniFocus and [Reclaim.ai](https://reclaim.ai) for intelligent task scheduling and time management.

## Overview

This OmniFocus plugin enables seamless integration with Reclaim.ai's AI-powered calendar assistant. Sync your OmniFocus tasks to Reclaim, where they can be automatically scheduled based on your availability, priorities, and work hours preferences.

## Features

### Task Synchronization
- **Bidirectional Sync**: Changes in OmniFocus are pushed to Reclaim, and scheduling updates from Reclaim flow back to OmniFocus
- **Selective Sync**: Choose which tasks to sync using tags
- **Auto-sync**: Optionally enable automatic synchronization after making changes
- **Batch Operations**: Sync all enabled tasks or just selected ones

### Task Attributes
The plugin syncs the following task properties:
- **Title & Notes**: Task names and descriptions (with cross-links between both apps)
- **Due Dates & Defer Dates**: Deadlines and start dates
- **Completion Status**: Automatically mark tasks complete in both systems
- **Duration**: OmniFocus estimated minutes map to Reclaim scheduling duration

### Reclaim-Specific Features

#### Priority Levels
Set task priorities that control how Reclaim schedules your work:
- **P1 — Critical**: Highest priority tasks
- **P2 — High**: Important tasks
- **P3 — Medium**: Standard priority
- **P4 — Low**: Lower priority tasks

#### Scheduling Hours
Configure which scheduling scheme Reclaim should use for each task:
- Working Hours
- Personal Hours
- Meeting Hours
- Custom time schemes you've created in Reclaim

#### Advanced Options
- **Up Next**: Flag tasks for Reclaim's "Up Next" list for immediate focus
- **Split Up**: Allow Reclaim to break larger tasks into smaller time blocks across your calendar

## Installation

1. Download the `.omnifocusjs` plugin package
2. Double-click to install in OmniFocus
3. In OmniFocus, run the "Configure Reclaim Sync" action
4. Enter your Reclaim.ai API key (found in Reclaim Settings → Integrations → API)

## Usage

### Getting Started

1. **Configure**: Run "Configure Reclaim Sync" to set up your API key and preferences
2. **Enable Sync**: Select tasks you want to sync and run "Enable Reclaim Sync"
3. **Sync**: Run "Sync Selected" or "Sync All" to push tasks to Reclaim

### Available Actions

#### Setup & Configuration
- **Configure Reclaim Sync**: Set up API credentials and sync preferences
- **Enable Reclaim Sync**: Tag selected tasks for synchronization
- **Disable Reclaim Sync**: Remove tasks from sync and optionally delete from Reclaim

#### Task Properties
- **Set Reclaim Priority**: Assign P1-P4 priority levels
- **Set Reclaim Hours**: Choose which scheduling hours to use
- **Send to Reclaim Up Next**: Flag tasks for immediate focus
- **Allow Reclaim to Split Up Task**: Enable task chunking

#### Synchronization
- **Sync Selected**: Sync currently selected tasks
- **Sync All**: Sync all tasks tagged for Reclaim sync

### Tag Structure

The plugin uses a hierarchical tag system under the `Reclaim` root tag:
```

Reclaim
├── Sync                    (marks tasks for synchronization)
├── Up Next                 (flags for immediate focus)
├── Split Up                (allows task chunking)
├── Hours
│   ├── Working Hours
│   ├── Personal Hours
│   └── [Custom Schemes]
└── Priority
├── P1 — Critical
├── P2 — High
├── P3 — Medium
└── P4 — Low
```
### Auto-Sync Mode

Enable auto-sync in "Configure Reclaim Sync" to automatically push changes after:
- Enabling sync on tasks
- Setting priorities
- Changing scheduling hours
- Toggling Up Next or Split Up flags

## Cross-Linking

The plugin maintains bidirectional links:
- **OmniFocus → Reclaim**: Each synced task's note contains a direct link to view it in Reclaim
- **Reclaim → OmniFocus**: Each Reclaim task's notes include a deep-link back to OmniFocus

## How It Works

### Task Identification
- The plugin maintains a persistent mapping between OmniFocus task IDs and Reclaim task IDs
- Tasks are tracked even if you rename them or move them between projects

### Sync Logic
- **Updates**: If a task already exists in Reclaim, it's updated via PATCH
- **Creates**: New tasks are created via POST
- **Deletes**: Disabling sync optionally removes tasks from Reclaim
- **Completion**: Marking tasks complete syncs in both directions

### Date Synchronization
- OmniFocus due dates → Reclaim deadlines
- OmniFocus defer dates → Reclaim snooze-until dates
- Reclaim can update these dates based on scheduling changes

## Requirements

- OmniFocus 3 for Mac or iOS
- Active [Reclaim.ai](https://reclaim.ai) account
- Reclaim.ai API key (generate in Settings → Integrations → API)

## Privacy & Security

- API credentials are stored securely in the system keychain
- Task data is transmitted directly between your device and Reclaim's API
- No third-party servers or intermediaries are involved

## Support & Troubleshooting

### Common Issues

**"Invalid API key" error**
- Re-run "Configure Reclaim Sync" and verify your API key
- Check that your key hasn't been revoked in Reclaim settings

**Tasks not appearing in Reclaim**
- Ensure tasks are tagged with "Reclaim : Sync"
- Run "Sync Selected" or "Sync All" manually
- Check that tasks aren't dropped in OmniFocus

**Scheduling hours not applying**
- Verify the time scheme exists and is active in Reclaim
- Custom schemes must have `ACTIVE` status in Reclaim

## Author

Created by Kraig Parkinson

## License

See license file for details.
