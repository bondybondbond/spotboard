# Suggested Commands for Development

This document lists essential commands for developing within the 'spotboard' project.

## Project-Specific Commands

*   **Start Development Server:**
    ```bash
    npm run dev
    ```
    This command starts the Vite development server, enabling hot module replacement (HMR) for a fast development experience.

*   **Build Project for Production:**
    ```bash
    npm run build
    ```
    This command compiles the TypeScript code and then bundles the project for production deployment. The output will be in the `dist/` directory.

*   **Run Linting Checks:**
    ```bash
    npm run lint
    ```
    Executes ESLint to check the codebase for stylistic issues and potential errors, ensuring adherence to the project's coding standards.

*   **Preview Production Build Locally:**
    ```bash
    npm run preview
    ```
    After building, this command allows you to serve and test the optimized production build locally.

## General System Utility Commands (Windows)

*   **Change Directory:**
    ```bash
    cd <directory_path>
    ```
    Navigates to the specified directory.

*   **List Directory Contents:**
    ```bash
    dir
    ```
    Displays a list of files and subdirectories in the current directory.

*   **View File Contents:**
    ```bash
    type <filename>
    ```
    Shows the content of a text file in the console.

*   **Search for Text in Files:**
    ```bash
    findstr "<pattern>" <files_or_directories>
    ```
    A command-line utility for searching for specific text patterns within files. For example: `findstr "MyComponent" src/*.tsx`

*   **Version Control (Git):**
    ```bash
    git <command>
    ```
    Use standard Git commands for version control operations (e.g., `git status`, `git add .`, `git commit -m "Message"`, `git push`).
