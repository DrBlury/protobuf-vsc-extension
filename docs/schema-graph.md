# Schema Graph

Visualize the relationships between messages, enums, and services in your Protocol Buffers schema.

## Overview

The Schema Graph provides an interactive visual representation of your proto schema, showing how messages, enums, and services relate to each other.

## How to Use

1. Open a proto file
2. Press `Cmd/Ctrl+Shift+P`
3. Type "Protobuf: Show Schema Graph"
4. The graph opens in a new panel

## Features

### Visual Representation

- **Nodes** - Represent messages, enums, and services
- **Edges** - Show relationships (field types, RPC types)
- **Colors** - Different colors for different symbol types
- **Layout** - Automatic layout for easy viewing

### Interactive Navigation

- **Click nodes** - Navigate to symbol definitions
- **Hover** - See details about symbols
- **Zoom** - Zoom in/out for large graphs
- **Pan** - Move around the graph

### Scope Options

- **File scope** - Show only the current file
- **Workspace scope** - Show entire workspace
- **Import scope** - Show current file and its imports

## Use Cases

### Understanding Dependencies

See how messages depend on each other:

```text
User → Address
User → Phone
Profile → User
```

### Exploring Large Schemas

Navigate large codebases visually:

- See all messages at a glance
- Understand the schema structure
- Find related types

### Documentation

Use the graph for:

- Architecture documentation
- Onboarding new team members
- Understanding system design

## Configuration

The schema graph uses your workspace configuration:

- Import paths
- Buf.yaml configuration
- Workspace roots

## Tips

1. **Start with file scope** - Begin with the current file, then expand
2. **Use for exploration** - Discover relationships you didn't know about
3. **Document architecture** - Export graphs for documentation
4. **Share with team** - Help team members understand the schema
5. **Regular updates** - Graph updates as you edit files

## Keyboard Shortcuts

- **Open Graph**: `Cmd/Ctrl+Shift+P` → "Protobuf: Show Schema Graph"
- **Refresh**: Click refresh button in graph panel
- **Navigate**: Click on nodes to go to definitions
