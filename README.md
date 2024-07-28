# Instasearch (v1.0)

## Introduction
This project is a client-side web application that allows users to search through their Instagram message history quickly and efficiently. It processes Instagram message HTML files locally in the user's browser, ensuring complete privacy and data security.

## Creator
This tool was created by anonymort. It was developed as an open-source project to help Instagram users easily search and navigate their message history.

## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## How to Get Your Instagram Message Files
1. Go to the Instagram Data Download page: [https://accountscenter.instagram.com/info_and_permissions/dyi/](https://accountscenter.instagram.com/info_and_permissions/dyi/)
2. Log in to your Instagram account if prompted.
3. Under "Select data range", choose the period for which you want to download data.
4. Under "Select information to download", make sure "Messages" is selected.
5. Choose the format as HTML.
6. Click "Submit request".
7. Instagram will process your request and send you an email with a download link when your data is ready.
8. Download the ZIP file and extract the contents.
9. Look for HTML files related to your messages in the extracted folder.

## How to Use the Instagram Message Search Tool
1. Visit the tool's website: [Your hosted website URL]
2. Click the "Choose Files" button and select the Instagram message HTML files you downloaded, or drag and drop the files onto the page. You can select multiple HTML files at once.
3. Wait for the files to be processed (this happens locally in your browser).
4. Use the search bar to search for specific words or phrases in your messages.
5. Click on any search result to view the message in a brief popup context window.
6. Use the "Toggle Dark Mode" button to switch between light and dark themes.
7. Use the "Clear Search" button to reset your search and results.

## Privacy Assurances
This tool is designed with your privacy as the top priority:

1. **Local Processing**: All data processing occurs entirely within your web browser. No data is ever sent to any external server.
2. **No Data Storage**: Your message data is not stored anywhere outside of the temporary memory used by your browser while using the tool. Once you close or refresh the page, all loaded data is cleared.
3. **Open Source**: The entire source code for this tool is available in this repository for review. You can verify that no data transmission or external storage is taking place.
4. **Client-Side Application**: This is a purely client-side application. There is no backend server involved in processing your data.

By using this tool, you can be confident that your personal Instagram messages remain private and secure.

## Technical Details
This tool is built using vanilla JavaScript and utilizes modern web APIs including:
- File API for local file processing
- Web Workers for efficient, non-blocking data processing
- Local Storage for saving user preferences (like dark mode setting)

## Contributions
Contributions to this project are welcome! Please feel free to submit a Pull Request.

## Issues
If you encounter any problems or have any suggestions, please open an issue in this repository.
