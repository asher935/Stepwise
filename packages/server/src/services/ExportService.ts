import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, BorderStyle } from 'docx';
import archiver from 'archiver';
import { chromium } from 'playwright-core';
import { createWriteStream, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { ClickStep, HoverStep, ScrollStep, SelectStep, Step, TypeStep, ExportOptions, ExportResult, StepwiseManifest } from '@stepwise/shared';
import type { ServerSession } from '../types/session.js';
import { encrypt } from '../lib/crypto.js';
import { env } from '../lib/env.js';

/**
 * ExportService handles exporting sessions to various formats
 */
export class ExportService {
  private session: ServerSession;

  constructor(session: ServerSession) {
    this.session = session;
  }

  /**
   * Exports the session to the specified format(s)
   */
  async export(options: ExportOptions): Promise<ExportResult> {
    const exportDir = join(env.TEMP_DIR, 'exports', this.session.id);
    await mkdir(exportDir, { recursive: true });

    const title = options.title ?? `Stepwise Guide - ${new Date().toLocaleDateString()}`;

    // Support for multiple formats
    const formats = options.formats ?? (options.format ? [options.format] : []);

    if (formats.length === 0) {
      throw new Error('At least one format must be specified');
    }

    // Single format export
    if (formats.length === 1) {
      const format = formats[0]!;
      switch (format) {
        case 'pdf':
          return await this.exportPDF(exportDir, title, options);
        case 'docx':
          return await this.exportDOCX(exportDir, title, options);
        case 'markdown':
          return await this.exportMarkdown(exportDir, title, options);
        case 'html':
          return await this.exportHTML(exportDir, title, options);
        case 'stepwise':
          return await this.exportStepwise(exportDir, title, options);
        default: {
          const exhaustiveCheck: never = format;
          throw new Error(`Unsupported export format: ${exhaustiveCheck}`);
        }
      }
    }

    // Multi-format export - create a zip with all formats
    return await this.exportMultiple(exportDir, title, formats, options);
  }

  /**
   * Exports to multiple formats in a single ZIP file
   */
  private async exportMultiple(
    exportDir: string,
    title: string,
    formats: ExportFormat[],
    options: ExportOptions
  ): Promise<ExportResult> {
    const filename = `${this.sanitizeFilename(title)}.zip`;
    const filepath = join(exportDir, filename);

    return new Promise((resolve, reject) => {
      const output = createWriteStream(filepath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        resolve({
          filename,
          mimeType: 'application/zip',
          size: archive.pointer(),
        });
      });

      archive.on('error', reject);
      archive.pipe(output);

      // Export each format and add to zip
      const exportPromises = formats.map(async (format) => {
        const tempDir = join(exportDir, 'temp');
        const result = await this.exportSingleFormat(tempDir, title, format, options);
        const sourceFile = join(tempDir, result.filename);
        const destFile = result.filename;

        try {
          const fileBuffer = await readFile(sourceFile);
          archive.append(fileBuffer, { name: destFile });
        } catch (err) {
          console.error(`Failed to add ${result.filename} to zip:`, err);
        }
      });

      void Promise.all(exportPromises).then(() => {
        void archive.finalize();
      }).catch(reject);
    });
  }

  /**
   * Exports a single format and returns the result (used by multi-format export)
   */
  private async exportSingleFormat(
    exportDir: string,
    title: string,
    format: ExportFormat,
    options: ExportOptions
  ): Promise<ExportResult> {
    await mkdir(exportDir, { recursive: true });

    switch (format) {
      case 'pdf':
        return await this.exportPDF(exportDir, title, options);
      case 'docx':
        return await this.exportDOCX(exportDir, title, options);
      case 'markdown':
        return await this.exportMarkdown(exportDir, title, options);
      case 'html':
        return await this.exportHTML(exportDir, title, options);
      case 'stepwise':
        return await this.exportStepwise(exportDir, title, options);
      default: {
        const exhaustiveCheck: never = format;
        throw new Error(`Unsupported export format: ${exhaustiveCheck}`);
      }
    }
  }

  /**
   * Exports to PDF using Playwright
   */
  private async exportPDF(
    exportDir: string,
    title: string,
    options: ExportOptions
  ): Promise<ExportResult> {
    const html = this.generateHTMLContent(title, options, false);
    const filename = `${this.sanitizeFilename(title)}.pdf`;
    const filepath = join(exportDir, filename);

    const browser = await chromium.launch({ 
      headless: true,
      executablePath: process.env['CHROME_BIN'] || undefined,
    });
    const page = await browser.newPage();
    
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.pdf({
      path: filepath,
      format: 'A4',
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
      printBackground: true,
    });
    
    await browser.close();

    const file = Bun.file(filepath);
    const stats = await file.size;
    
    return {
      filename,
      mimeType: 'application/pdf',
      size: stats,
    };
  }

  /**
   * Exports to DOCX
   */
  private async exportDOCX(
    exportDir: string,
    title: string,
    options: ExportOptions
  ): Promise<ExportResult> {
    const children: Paragraph[] = [];

    children.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 400 },
      })
    );

    for (const step of this.session.steps) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Step ${step.index + 1}: `,
              bold: true,
            }),
            new TextRun({
              text: step.caption || this.getDefaultCaption(step),
            }),
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 },
        })
      );

      if (options.includeScreenshots !== false) {
        try {
          const imageBuffer = await readFile(step.screenshotPath);
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imageBuffer,
                  transformation: {
                    width: 500,
                    height: 312,
                  },
                  type: 'jpg',
                }),
              ],
              spacing: { after: 200 },
              border: {
                top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
              },
            })
          );
        } catch {
          // Skip if screenshot not available
        }
      }
    }

    const doc = new Document({
      sections: [{ children }],
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `${this.sanitizeFilename(title)}.docx`;
    const filepath = join(exportDir, filename);
    
    await writeFile(filepath, buffer as any);

    return {
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: buffer.length,
    };
  }

  /**
   * Exports to Markdown (as ZIP with images)
   */
  private async exportMarkdown(
    exportDir: string,
    title: string,
    options: ExportOptions
  ): Promise<ExportResult> {
    const filename = `${this.sanitizeFilename(title)}.zip`;
    const filepath = join(exportDir, filename);

    return new Promise((resolve, reject) => {
      const output = createWriteStream(filepath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        resolve({
          filename,
          mimeType: 'application/zip',
          size: archive.pointer(),
        });
      });

      archive.on('error', reject);
      archive.pipe(output);

      let markdown = `# ${title}\n\n`;
      markdown += `*Generated on ${new Date().toLocaleString()}*\n\n`;
      markdown += `---\n\n`;

      for (const step of this.session.steps) {
        markdown += `## Step ${step.index + 1}\n\n`;
        markdown += `${step.caption || this.getDefaultCaption(step)}\n\n`;

        if (options.includeScreenshots !== false) {
          const imgName = `step-${step.index + 1}.jpg`;
          markdown += `![Step ${step.index + 1}](./images/${imgName})\n\n`;
          
          try {
            const imgBuffer = readFileSync(step.screenshotPath);
            archive.append(imgBuffer, { name: `images/${imgName}` });
          } catch {
            // Skip if not available
          }
        }

        markdown += `---\n\n`;
      }

      archive.append(markdown, { name: 'guide.md' });
      void archive.finalize();
    });
  }

  /**
   * Exports to HTML (as ZIP with images)
   */
  private async exportHTML(
    exportDir: string,
    title: string,
    options: ExportOptions
  ): Promise<ExportResult> {
    const filename = `${this.sanitizeFilename(title)}.zip`;
    const filepath = join(exportDir, filename);

    return new Promise((resolve, reject) => {
      const output = createWriteStream(filepath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        resolve({
          filename,
          mimeType: 'application/zip',
          size: archive.pointer(),
        });
      });

      archive.on('error', reject);
      archive.pipe(output);

      const html = this.generateHTMLContent(title, options, true);
      archive.append(html, { name: 'index.html' });

      if (options.includeScreenshots !== false) {
        for (const step of this.session.steps) {
          const imgName = `step-${step.index + 1}.jpg`;
          try {
            const imgBuffer = readFileSync(step.screenshotPath);
            archive.append(imgBuffer, { name: `images/${imgName}` });
          } catch {
            // Skip if not available
          }
        }
      }

      const css = this.generateCSS(options.theme ?? 'light');
      archive.append(css, { name: 'styles.css' });

      void archive.finalize();
    });
  }

  /**
   * Exports to .stepwise format (encrypted ZIP)
   */
  private async exportStepwise(
    exportDir: string,
    title: string,
    options: ExportOptions
  ): Promise<ExportResult> {
    const filename = `${this.sanitizeFilename(title)}.stepwise`;
    const filepath = join(exportDir, filename);

    const manifest: StepwiseManifest = {
      version: '1.0.0',
      createdAt: Date.now(),
      title,
      stepCount: this.session.steps.length,
      encrypted: !!options.password,
    };

    const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: any[] = [];
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.on('data', (chunk: Buffer) => chunks.push(chunk as any));
      archive.on('end', () => resolve(Buffer.concat(chunks as any) as any));
      archive.on('error', reject);

      archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
      archive.append(JSON.stringify(this.session.steps, null, 2), { name: 'steps.json' });

      for (const step of this.session.steps) {
        try {
          const imgBuffer = readFileSync(step.screenshotPath);
          archive.append(imgBuffer, { name: `screenshots/${basename(step.screenshotPath)}` });
        } catch {
          // Skip if not available
        }
      }

      void archive.finalize();
    });

    const finalBuffer = options.password
      ? Buffer.from(await encrypt(new Uint8Array(zipBuffer), options.password))
      : zipBuffer;

    await writeFile(filepath, finalBuffer as any);

    return {
      filename,
      mimeType: 'application/octet-stream',
      size: finalBuffer.length,
    };
  }

  /**
   * Generates HTML content
   */
  private generateHTMLContent(title: string, options: ExportOptions, useExternalImages: boolean): string {
    const theme = options.theme ?? 'light';
    const steps = this.session.steps;

    let stepsHtml = '';
    for (const step of steps) {
      let imgSrc = '';
      if (options.includeScreenshots !== false) {
        if (useExternalImages) {
          imgSrc = `./images/step-${step.index + 1}.jpg`;
        } else {
          try {
            const imgBuffer = readFileSync(step.screenshotPath);
            imgSrc = `data:image/jpeg;base64,${imgBuffer.toString('base64')}`;
          } catch {
            imgSrc = '';
          }
        }
      }

      stepsHtml += `
        <div class="step">
          <div class="step-header">
            <span class="step-number">${step.index + 1}</span>
            <span class="step-caption">${this.escapeHtml(step.caption || this.getDefaultCaption(step))}</span>
          </div>
          ${imgSrc ? `<img src="${imgSrc}" alt="Step ${step.index + 1}" class="step-image" />` : ''}
        </div>
      `;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  ${useExternalImages ? '<link rel="stylesheet" href="styles.css">' : `<style>${this.generateCSS(theme)}</style>`}
</head>
<body class="theme-${theme}">
  <div class="container">
    <header>
      <h1>${this.escapeHtml(title)}</h1>
      <p class="date">Generated on ${new Date().toLocaleString()}</p>
    </header>
    <main>
      ${stepsHtml}
    </main>
  </div>
</body>
</html>`;
  }

  /**
   * Generates CSS for HTML export
   */
  private generateCSS(theme: 'light' | 'dark'): string {
    const colors = theme === 'dark' 
      ? { bg: '#1a1a1a', text: '#ffffff', border: '#333', stepBg: '#252525' }
      : { bg: '#ffffff', text: '#333333', border: '#e0e0e0', stepBg: '#f9f9f9' };

    return `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: ${colors.bg};
        color: ${colors.text};
        line-height: 1.6;
        padding: 40px 20px;
      }
      .container { max-width: 800px; margin: 0 auto; }
      header { margin-bottom: 40px; text-align: center; }
      h1 { font-size: 2rem; margin-bottom: 10px; }
      .date { color: #888; font-size: 0.9rem; }
      .step {
        background: ${colors.stepBg};
        border: 1px solid ${colors.border};
        border-radius: 8px;
        margin-bottom: 30px;
        overflow: hidden;
      }
      .step-header {
        padding: 15px 20px;
        display: flex;
        align-items: center;
        gap: 15px;
        border-bottom: 1px solid ${colors.border};
      }
      .step-number {
        background: #3b82f6;
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        flex-shrink: 0;
      }
      .step-caption { font-weight: 500; }
      .step-image {
        width: 100%;
        display: block;
      }
      @media print {
        .step { page-break-inside: avoid; }
      }
    `;
  }

  /**
   * Gets default caption for a step
   */
  private getDefaultCaption(step: Step): string {
    switch (step.action) {
      case 'click':
        return `Click on ${(step as ClickStep).target.elementTag}`;
      case 'type':
        return `Type in ${(step as TypeStep).fieldName}`;
      case 'navigate':
        return `Navigate to page`;
      case 'scroll':
        return `Scroll ${(step as ScrollStep).direction}`;
      case 'select':
        return `Select "${(step as SelectStep).selectedText}"`;
      case 'hover':
        return `Hover over ${(step as HoverStep).target.elementTag}`;
      default: {
        const exhaustiveCheck: never = step;
        return `Action: ${(exhaustiveCheck as Step).action}`;
      }
    }
  }

  /**
   * Sanitizes filename
   */
  private sanitizeFilename(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 100);
  }

  /**
   * Escapes HTML
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
