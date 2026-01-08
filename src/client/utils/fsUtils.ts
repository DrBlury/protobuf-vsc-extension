/**
 * VS Code Filesystem Utilities
 * Provides async filesystem operations using VS Code's abstract filesystem API.
 * This allows the extension to work with remote workspaces (SSH, WSL, containers).
 */

import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from 'util';

/**
 * Check if a file or directory exists.
 * @param filePath - The absolute path to check
 * @returns true if the path exists, false otherwise
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the contents of a file as a UTF-8 string.
 * @param filePath - The absolute path to read
 * @returns The file contents as a string
 * @throws Error if the file cannot be read
 */
export async function readFile(filePath: string): Promise<string> {
  const uri = vscode.Uri.file(filePath);
  const data = await vscode.workspace.fs.readFile(uri);
  return new TextDecoder('utf-8').decode(data);
}

/**
 * Write a UTF-8 string to a file.
 * @param filePath - The absolute path to write to
 * @param content - The string content to write
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  const data = new TextEncoder().encode(content);
  await vscode.workspace.fs.writeFile(uri, data);
}

/**
 * Create a directory (recursively creates parent directories if needed).
 * @param dirPath - The absolute path of the directory to create
 */
export async function createDirectory(dirPath: string): Promise<void> {
  const uri = vscode.Uri.file(dirPath);
  await vscode.workspace.fs.createDirectory(uri);
}

/**
 * Delete a file.
 * @param filePath - The absolute path to delete
 * @param options - Optional deletion options (recursive for directories)
 */
export async function deleteFile(filePath: string, options?: { recursive?: boolean }): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  await vscode.workspace.fs.delete(uri, options);
}

/**
 * Read directory contents.
 * @param dirPath - The absolute path of the directory to read
 * @returns Array of [name, type] tuples
 */
export async function readDirectory(dirPath: string): Promise<[string, vscode.FileType][]> {
  const uri = vscode.Uri.file(dirPath);
  return vscode.workspace.fs.readDirectory(uri);
}

/**
 * Check if a path is a directory.
 * @param filePath - The absolute path to check
 * @returns true if the path is a directory, false otherwise
 */
export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const uri = vscode.Uri.file(filePath);
    const stat = await vscode.workspace.fs.stat(uri);
    return (stat.type & vscode.FileType.Directory) !== 0;
  } catch {
    return false;
  }
}
