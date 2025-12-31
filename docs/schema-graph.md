# Schema Graph

Visualize the relationships between messages, enums, and services in your Protocol Buffers schema with powerful interactive features.

## Overview

The Schema Graph provides an interactive visual representation of your proto schema, showing how messages, enums, and services relate to each other. Navigate complex schemas with search, filtering, path highlighting, and export capabilities.

## How to Open

1. Open a proto file
2. Press `Cmd/Ctrl+Shift+P` to open the Command Palette
3. Type "Protobuf: Show Schema Graph"
4. The graph opens in a new panel beside your editor

## Features

### Visual Representation

- **Nodes** - Represent messages, enums, and services
- **Edges** - Show relationships (field types, RPC types, nested types)
- **Colors** - Different colors for different symbol types
- **Layout** - Automatic layout with multiple options

### Export Options

Save your schema visualizations in multiple formats:

- **Export as SVG** - Vector format perfect for documentation and web use
- **Export as PNG** - High-resolution images (2x scale) for presentations
- **Export as PDF** - Ideal for sharing and printing documentation
- All exports use a save dialog to choose your preferred location

### Search

Quickly find types in your schema:

- **Real-time search** - Instant filtering as you type
- **Highlighting** - Matching nodes are highlighted, non-matches are dimmed
- **Match count** - Shows "X of Y" (e.g., "3 of 42") to track results
- **Case-insensitive** - Search without worrying about capitalization
- **Keyboard shortcut** - Press `Ctrl/Cmd+F` to focus the search box

### Filtering

Narrow down your view to focus on what matters:

- **Filter by Package** - Dropdown menu to show only types from a specific package
- **Filter by File** - Dropdown menu to show only types from a specific file
- **Hide/Show Enums** - Toggle button to show or hide enum types from the view
- Filters work together - combine package and file filters for precise results

### Path Highlighting

Find relationships between any two types:

1. Click the **"Path Mode"** button to activate path finding
2. Click the first node (source) - highlighted in green
3. Click the second node (target) - highlighted in red
4. The shortest path is highlighted with animated orange edges
5. Path details are shown in the status bar
6. Click the background or press `Escape` to clear the path

### Layout Options

Choose the best layout for your schema:

- **Horizontal** - Left-to-right layout (default, ideal for most schemas)
- **Vertical** - Top-to-bottom layout (good for tall, narrow schemas)
- **Compact** - Box layout for dense graphs (maximizes screen space)

### Group by Package

Better understand your schema organization:

- **Toggle grouping** - Button to group types by their package
- **Visual containers** - Creates rounded rectangles around package members
- **Clear boundaries** - Helps understand package relationships and dependencies

### Navigation

Interact with nodes for quick navigation:

- **Double-click** any node to jump to its definition
- **Right-click context menu** provides:
  - **Go to Definition** - Jump to the symbol definition
  - **Copy Name** - Copy the simple type name
  - **Copy Full Name** - Copy the name with package prefix
  - **Find Paths From Here** - Start path finding from this node
  - **Find Paths To Here** - Find paths ending at this node

### Orphan Detection

Identify unused or entry-point types:

- **Toggle "Orphans"** button to highlight unreferenced types
- **Visual indicator** - Orphans shown with dashed orange borders
- **Count display** - Number of orphans shown in the status bar
- **Use cases** - Find dead code, identify API entry points, clean up schemas

### Scope Options

Control what portion of your schema is displayed:

- **File scope** - Show only the current file and its imports
- **Workspace scope** - Show entire workspace
- Scope selector in the toolbar for easy switching

### Interactive Navigation

- **Zoom** - Mouse wheel or pinch gestures to zoom in/out
- **Pan** - Click and drag to move around large graphs
- **Reset view** - Double-click background to fit all nodes in view

## Keyboard Shortcuts

- **Open Graph**: `Cmd/Ctrl+Shift+P` → "Protobuf: Show Schema Graph"
- **Focus Search**: `Ctrl/Cmd+F`
- **Clear Selection**: `Escape` (clears search, path mode, and menus)
- **Refresh**: Click refresh button or press `F5`
- **Navigate**: Double-click nodes to go to definitions

## Use Cases

### Understanding Dependencies

See how messages depend on each other:

```text
User → Address
User → Phone  
Profile → User
```

Use path highlighting to trace complex dependency chains and understand data flow through your system.

### Exploring Large Schemas

Navigate large codebases effectively:

- Use search to find specific types quickly
- Filter by package to focus on related functionality
- Hide enums to reduce clutter when examining message relationships
- Use compact layout for maximum visibility

### Code Review and Architecture

Support team collaboration:

- Export graphs as SVG for technical documentation
- Use PDF exports for architecture review meetings
- Share PNG screenshots in pull requests
- Highlight orphan types to identify potential cleanup opportunities

### Schema Refactoring

Plan and validate schema changes:

- Use path highlighting to understand impact of changes
- Find all types that depend on a message before refactoring
- Identify orphan types that might be safe to remove
- Filter by file to focus on specific modules

## Tips

1. **Start with search** - Quickly locate the types you care about
2. **Use path highlighting** - Understand complex dependencies between types
3. **Filter strategically** - Combine package and file filters for focused views
4. **Export for documentation** - Save graphs in SVG for vector graphics or PNG for presentations
5. **Check for orphans** - Regularly scan for unused types to keep schemas clean
6. **Try different layouts** - Switch between horizontal, vertical, and compact based on your schema structure
7. **Group by package** - Get a high-level view of your schema organization
8. **Use keyboard shortcuts** - Speed up navigation with `Ctrl/Cmd+F` and `Escape`

## Configuration

The schema graph uses your workspace configuration:

- Import paths from `protobuf.includes` setting
- Buf.yaml configuration for workspace roots
- File watching updates the graph as you edit
- Real-time synchronization with your editor changes
