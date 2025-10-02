

import { Component, OnInit } from '@angular/core';
import { FirebaseService } from './firebase.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  async exportReport() {
    try {
      const col = this.firebase.getCollection('files');
      const snap = await this.firebase.getDocs(col);
      // Only export files that contain metadata
      const files = snap.docs
        .map(doc => doc.data() as { filePath?: string; diskId?: string; metadata?: any })
        .filter(data => data.metadata && Object.keys(data.metadata).length > 0);
      if (files.length === 0) {
        this.setMainAlert('No files with metadata to export.');
        return;
      }
      // Prepare CSV header
  const allKeys = Array.from(new Set(files.reduce((acc: string[], f: { metadata?: any }) => acc.concat(Object.keys(f.metadata || {})), [])));
      const header = ['File Path', 'Disk ID', ...allKeys];
      const rows = files.map(f => {
        const row = [
          '"' + (f.filePath || '') + '"',
          '"' + (f.diskId || '') + '"',
          ...allKeys.map((k: string) => '"' + (f.metadata && typeof f.metadata[k] !== 'undefined' ? String(f.metadata[k]) : '') + '"')
        ];
        return row.join(',');
      });
      const csvContent = [header.join(','), ...rows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'metadata_export.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.setMainAlert('Metadata exported as CSV!');
    } catch (e) {
      this.setMainAlert('Error exporting metadata.');
    }
  }
  showTab(tabId: string) {
    this.activeTab = tabId;
  }
  playFile(filePath: string) {
    // Try to preview/play the file from its path if accessible
    const normalizedPath = this.firebase.normalizePath(filePath);
    // If filePath is an absolute/local path, use it directly
    if (filePath && (filePath.startsWith('file:///') || /^[a-zA-Z]:\\/.test(filePath) || filePath.startsWith('/'))) {
      this.videoPreviewUrl = filePath;
      this.setMainAlert('Preview loaded from file path.');
      this.showTab('metadataTab');
      return;
    }
    // Otherwise, fallback to blob if accessible
    const fileObj = this.selectedFiles.find(f => {
      const relPath = (f as any).webkitRelativePath || f.name;
      return this.firebase.normalizePath(relPath) === normalizedPath;
    });
    if (fileObj) {
      this.videoPreviewUrl = URL.createObjectURL(fileObj);
      this.setMainAlert('Preview loaded. See video above.');
      this.showTab('metadataTab');
    } else {
      alert('File not accessible for preview.');
    }
  }
  copyFile(filePath: string) {
    // Download the file if accessible
    const normalizedPath = this.firebase.normalizePath(filePath);
    const fileObj = this.selectedFiles.find(f => {
      const relPath = (f as any).webkitRelativePath || f.name;
      return this.firebase.normalizePath(relPath) === normalizedPath;
    });
    if (fileObj) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(fileObj);
      a.download = fileObj.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      this.setMainAlert('File downloaded!');
    } else {
      alert('File not accessible for download.');
    }
  }

  isFileAccessible(filePath: string): boolean {
    const normalizedPath = this.firebase.normalizePath(filePath);
    return this.selectedFiles.some(f => {
      const relPath = (f as any).webkitRelativePath || f.name;
      return this.firebase.normalizePath(relPath) === normalizedPath;
    });
  }
  restoreFile: File | null = null;
  exportMessage: string = '';
  mainAlert: string = '';
  setMainAlert(msg: string, timeout: number = 3000) {
    this.mainAlert = msg;
    if (timeout > 0) {
      setTimeout(() => this.mainAlert = '', timeout);
    }
  }
  videoPreviewUrl: string = '';
  updateFilePath(filePath: string) {
    // Prompt user to select folder and update file path
    const input = document.createElement('input');
    input.type = 'file';
    (input as any).webkitdirectory = true;
    (input as any).directory = true;
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files) {
        alert('No files selected.');
        return;
      }
      const files = Array.from(input.files);
      const normalizedOldPath = this.firebase.normalizePath(filePath);
      const matchingFile = files.find(f => {
        const relPath = (f as any).webkitRelativePath || f.name;
        return this.firebase.normalizePath(relPath) === normalizedOldPath;
      });
      if (!matchingFile) {
        alert('Selected folder does not contain the file. Please select the correct folder.');
        return;
      }
      try {
        const col = this.firebase.getCollection('files');
        const snap = await this.firebase.getDocs(this.firebase.query(col, this.firebase.where('filePath', '==', filePath)));
        if (snap.empty) {
          alert('File not found in Firestore.');
          return;
        }
        const docRef = snap.docs[0].ref;
        const newPath = this.firebase.normalizePath((matchingFile as any).webkitRelativePath || matchingFile.name);
        await this.firebase.updateDoc(docRef, { filePath: newPath });
        alert(`File path updated for "${newPath.split('/').pop()}".`);
        this.selectedFiles = [...this.selectedFiles, ...files];
        await this.loadScannedFiles();
      } catch (e) {
        alert('Error updating file path.');
      }
    };
    input.click();
  }
  rescanDisk(diskId: string) {
    // Open file picker for rescan
    const input = document.createElement('input');
    input.type = 'file';
    (input as any).webkitdirectory = true;
    (input as any).directory = true;
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files) {
        alert('No files selected.');
        return;
      }
      const files = Array.from(input.files);
      this.selectedFiles = files;
      this.scanDiskId = diskId;
      await this.scanDisk();
    };
    input.click();
  }
  diskIdsFromFiles: string[] = [];

  async loadDiskIdsFromFiles() {
    try {
      const col = this.firebase.getCollection('files');
      const snap = await this.firebase.getDocs(col);
      const files = snap.docs.map((doc: any) => doc.data() as { diskId?: string });
      const diskIds = Array.from(new Set(files.map((f: any) => f.diskId).filter((id: any) => !!id)));
      this.diskIdsFromFiles = diskIds;
    } catch (e) {
      alert('Error loading disk IDs from files.');
    }
  }
  constructor(public firebase: FirebaseService) {}

  ngOnInit(): void {
    this.initFirebase();
    window.addEventListener('beforeunload', (event) => {
      event.preventDefault();
      event.returnValue = 'Would you like to back up your data before closing? Go to the Export tab and click "Backup Data" to save as JSON.';
    });
  }

  async initFirebase() {
    try {
      await this.firebase.initializeFirebase();
    } catch (e) {
      alert('Failed to initialize Firebase. Please check your Firebase configuration and reload the page.');
    }
  }
  // Search tab state
  searchDiskId = '';
  searchProgramme = '';
  searchEpisodeNumber: number | null = null;
  searchTelecastDate = '';
  searchMetadata = '';
  searchLogic = 'AND';
  searchResults: Array<{
    filePath: string;
    diskId: string;
    programme: string;
    episode: number | null;
    date: string;
    metadata: string;
  }> = [];

  async searchFiles() {
    try {
      const col = this.firebase.getCollection('files');
      let constraints = [];
      if (this.searchDiskId) constraints.push(this.firebase.where('diskId', '==', this.searchDiskId));
      if (this.searchProgramme) constraints.push(this.firebase.where('metadata.Name of Programme', '==', this.searchProgramme));
      if (this.searchEpisodeNumber) constraints.push(this.firebase.where('metadata.Episode Number', '==', this.searchEpisodeNumber));
      if (this.searchTelecastDate) constraints.push(this.firebase.where('metadata.Telecast Date', '==', this.searchTelecastDate));
      const q = constraints.length ? this.firebase.query(col, ...constraints) : col;
      const snap = await this.firebase.getDocs(q);
      let results = snap.docs.map(doc => {
        const data = doc.data() as any;
        return {
          filePath: data.filePath || '',
          diskId: data.diskId || '',
          programme: data.metadata?.['Name of Programme'] || '',
          episode: data.metadata?.['Episode Number'] || null,
          date: data.metadata?.['Telecast Date'] || '',
          metadata: Object.entries(data.metadata || {}).map(([k, v]) => `${k}: ${v}`).join('; ')
        };
      });
      // AND/OR logic for all criteria
      results = results.filter(file => {
        const diskMatch = !this.searchDiskId || file.diskId.toLowerCase() === this.searchDiskId.toLowerCase();
        const programmeMatch = !this.searchProgramme || file.programme.toLowerCase() === this.searchProgramme.toLowerCase();
        const episodeMatch = !this.searchEpisodeNumber || file.episode == this.searchEpisodeNumber;
        const dateMatch = !this.searchTelecastDate || file.date === this.searchTelecastDate;
        const metadataMatch = !this.searchMetadata || file.metadata.toLowerCase().includes(this.searchMetadata.toLowerCase());
        if (this.searchLogic === 'AND') {
          return diskMatch && programmeMatch && episodeMatch && dateMatch && metadataMatch;
        } else {
          return diskMatch || programmeMatch || episodeMatch || dateMatch || metadataMatch;
        }
      });
      this.searchResults = results;
    } catch (e) {
      this.setMainAlert('Error searching files.');
    }
  }

  // Metadata tab state
  metadataFilePath = '';
  metadataProgramme = '';
  metadataEpisodeNumber: number | null = null;
  metadataTelecastDate = '';
  metadataEpisodeDetails = '';
  customFields: { key: string; value: string }[] = [];

  async editMetadata(filePath: string) {
    this.metadataFilePath = filePath;
    // Always prompt for file selection if not accessible
    const normalizedPath = this.firebase.normalizePath(filePath);
    let fileObj = this.selectedFiles.find(f => {
      const relPath = (f as any).webkitRelativePath || f.name;
      return this.firebase.normalizePath(relPath) === normalizedPath;
    });
    if (!fileObj) {
      const input = document.createElement('input');
      input.type = 'file';
      (input as any).webkitdirectory = true;
      (input as any).directory = true;
      input.multiple = true;
      input.onchange = async () => {
        if (!input.files) {
          alert('No files selected.');
          this.videoPreviewUrl = '';
          return;
        }
        const files = Array.from(input.files);
        this.selectedFiles = [...this.selectedFiles, ...files];
        fileObj = files.find(f => {
          const relPath = (f as any).webkitRelativePath || f.name;
          return this.firebase.normalizePath(relPath) === normalizedPath;
        });
        if (fileObj) {
          this.videoPreviewUrl = URL.createObjectURL(fileObj);
          await this.loadMetadataFields(filePath);
        } else {
          alert('Selected folder does not contain the file.');
          this.videoPreviewUrl = '';
        }
      };
      input.click();
      this.showTab('metadataTab');
      return;
    } else {
      this.videoPreviewUrl = URL.createObjectURL(fileObj);
      await this.loadMetadataFields(filePath);
      this.showTab('metadataTab');
    }
  }

  async loadMetadataFields(filePath: string) {
    try {
      const col = this.firebase.getCollection('files');
      const snap = await this.firebase.getDocs(this.firebase.query(col, this.firebase.where('filePath', '==', filePath)));
      if (snap.empty) {
        alert('File not found!');
        return;
      }
      const file = snap.docs[0].data();
      this.metadataProgramme = file.metadata?.['Name of Programme'] || '';
      this.metadataEpisodeNumber = file.metadata?.['Episode Number'] || null;
      this.metadataTelecastDate = file.metadata?.['Telecast Date'] || '';
      this.metadataEpisodeDetails = file.metadata?.['Episode Details'] || '';
      this.customFields = Object.entries(file.metadata || {})
        .filter(([k]) => !['Name of Programme', 'Episode Number', 'Episode Details', 'Telecast Date'].includes(k))
        .map(([key, value]) => ({ key, value: String(value) }));
    } catch (e) {
      alert('Error loading metadata.');
    }
  }

  addCustomField() {
    this.customFields.push({ key: '', value: '' });
  }

  removeCustomField(index: number) {
    this.customFields.splice(index, 1);
  }

  async saveMetadata() {
    if (!this.metadataFilePath) {
      alert('Please select a file to edit metadata.');
      return;
    }
    try {
      const col = this.firebase.getCollection('files');
      const snap = await this.firebase.getDocs(this.firebase.query(col, this.firebase.where('filePath', '==', this.metadataFilePath)));
      if (snap.empty) {
        alert('File not found!');
        return;
      }
      const docRef = snap.docs[0].ref;
      const metadata: any = {};
      if (this.metadataProgramme) metadata['Name of Programme'] = this.metadataProgramme;
      if (this.metadataEpisodeNumber) metadata['Episode Number'] = this.metadataEpisodeNumber;
      if (this.metadataEpisodeDetails) metadata['Episode Details'] = this.metadataEpisodeDetails;
      if (this.metadataTelecastDate) metadata['Telecast Date'] = this.metadataTelecastDate;
      this.customFields.forEach(f => {
        if (f.key && f.value) metadata[f.key] = f.value;
      });
      await this.firebase.updateDoc(docRef, { metadata });
      // Auto-add new programme if not present
      if (this.metadataProgramme) {
        const exists = this.programmes.some(p => p.name.toLowerCase() === this.metadataProgramme.trim().toLowerCase());
        if (!exists) {
          const id = this.firebase.sanitizeId(this.metadataProgramme.trim());
          const ref = this.firebase.getDoc('programmes', id);
          await this.firebase.setDoc(ref, { id, name: this.metadataProgramme.trim() });
          await this.loadProgrammes();
        }
      }
      alert(`Metadata saved for: ${this.metadataFilePath}`);
      await this.loadScannedFiles();
    } catch (e) {
      alert('Error saving metadata.');
    }
  }

  // Scan HDD tab state
  scanDiskId = '';
  scanFiles: string[] = [];
  scanProgress = 0;
  scanProgressActive = false;
  selectedFiles: File[] = [];
  scannedFiles: { filePath: string; diskId: string }[] = [];
  selectedScannedDiskId: string = '';

  onFolderSelect(event: any) {
    const files = Array.from(event.target.files) as File[];
    this.selectedFiles = files;
    this.scanFiles = files.map(f => (f as any).webkitRelativePath || f.name);
  }

  async scanDisk() {
    if (!this.scanDiskId || this.selectedFiles.length === 0) {
      alert('Please enter a Disk ID and select a folder.');
      return;
    }
    // Exclude unwanted files/folders
    const excludedExtensions = ['.tmp', '.ds_store', '.ini', '.db', '.lnk'];
    const excludedPatterns = [/^\./, /^Thumbs\.db$/i, /^desktop\.ini$/i];
    const filteredFiles = this.selectedFiles.filter(f => {
      const relPath = (f as any).webkitRelativePath || f.name;
      const lower = relPath.toLowerCase();
      // Exclude by extension
      if (excludedExtensions.some(ext => lower.endsWith(ext))) return false;
      // Exclude by pattern
      if (excludedPatterns.some(pat => pat.test(lower))) return false;
      // Exclude hidden files/folders
      if (relPath.split('/').some((part: string) => part.startsWith('.'))) return false;
      return true;
    });
    this.scanProgressActive = true;
    this.scanProgress = 0;
    const total = filteredFiles.length;
    let processed = 0;
    try {
      for (const file of filteredFiles) {
        const filePath = (file as any).webkitRelativePath || file.name;
        const normalizedPath = this.firebase.normalizePath(filePath);
        const ref = this.firebase.getDoc('files', this.firebase.sanitizeId(normalizedPath));
        await this.firebase.setDoc(ref, {
          filePath: normalizedPath,
          diskId: this.scanDiskId,
          metadata: {}
        });
        processed++;
        this.scanProgress = Math.round((processed / total) * 100);
      }
      this.scanProgressActive = false;
      alert('Scan completed!');
      await this.loadScannedFiles();
      this.activeTab = 'scannedTab';
      // Update scanFiles to only show unarchived files
      const col = this.firebase.getCollection('files');
      const snap = await this.firebase.getDocs(col);
      this.scanFiles = snap.docs
        .map(doc => doc.data() as { filePath?: string; metadata?: any })
        .filter(data => !data.metadata || Object.keys(data.metadata).length === 0)
        .map(data => data.filePath || '');
    } catch (e) {
      this.scanProgressActive = false;
      alert('Error scanning files.');
    }
  }

  async loadScannedFiles() {
    try {
      const col = this.firebase.getCollection('files');
      const snap = await this.firebase.getDocs(col);
      // Only show files that are NOT archived (no metadata or empty metadata)
      let files = snap.docs
        .map(doc => doc.data() as { filePath?: string; diskId?: string; metadata?: any })
        .filter(data => !data.metadata || Object.keys(data.metadata).length === 0);
      if (this.selectedScannedDiskId) {
        files = files.filter(data => data.diskId === this.selectedScannedDiskId);
      }
      this.scannedFiles = files.map(data => ({ filePath: data.filePath || '', diskId: data.diskId || '' }));
    } catch (e) {
      alert('Error loading scanned files.');
    }
  }

  // Disks tab state
  disks: { id: string; editing?: boolean }[] = [];
  newDiskId = '';

  async loadDisks() {
    try {
      const col = this.firebase.getCollection('disks');
      const snap = await this.firebase.getDocs(col);
      this.disks = snap.docs.map(doc => {
        const data = doc.data() as { id?: string };
        return { id: doc.id, editing: false };
      });
    } catch (e) {
      alert('Error loading disks.');
    }
  }

  async addDisk() {
    const id = this.newDiskId.trim();
    if (!id) return;
    if (this.disks.some((d) => d.id.toLowerCase() === id.toLowerCase())) {
      this.setMainAlert(`Disk "${id}" already exists.`);
      return;
    }
    try {
      const ref = this.firebase.getDoc('disks', id);
      await this.firebase.setDoc(ref, { id });
      this.newDiskId = '';
      await this.loadDisks();
    } catch (e) {
      alert('Error adding disk.');
    }
  }

  async editDisk(disk: { id: string; editing?: boolean }) {
    if (!disk.editing) {
      disk.editing = true;
    } else {
      disk.editing = false;
      disk.id = disk.id.trim();
      try {
        const ref = this.firebase.getDoc('disks', disk.id);
        await this.firebase.updateDoc(ref, { id: disk.id });
        await this.loadDisks();
        this.setMainAlert('Disk updated!');
      } catch (e) {
        this.setMainAlert('Error editing disk.');
      }
    }
  }

  async deleteDisk(disk: { id: string }) {
    if (confirm('Are you sure you want to delete this disk?')) {
      try {
        const ref = this.firebase.getDoc('disks', disk.id);
        await this.firebase.deleteDoc(ref);
        await this.loadDisks();
        this.setMainAlert('Disk deleted!');
      } catch (e) {
        this.setMainAlert('Error deleting disk.');
      }
    }
  }

  // Programmes tab state
  programmes: { id: string; name: string; editing?: boolean }[] = [];
  newProgramme = '';

  async loadProgrammes() {
    try {
      const col = this.firebase.getCollection('programmes');
      const snap = await this.firebase.getDocs(col);
      this.programmes = snap.docs.map(doc => {
        const data = doc.data() as { name?: string };
        return { id: doc.id, name: data.name || '', editing: false };
      });
    } catch (e) {
      alert('Error loading programmes.');
    }
  }

  async addProgramme() {
    const name = this.newProgramme.trim();
    if (!name) return;
    if (this.programmes.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      alert(`Programme "${name}" already exists.`);
      return;
    }
    try {
      const id = this.firebase.sanitizeId(name);
      const ref = this.firebase.getDoc('programmes', id);
      await this.firebase.setDoc(ref, { id, name });
      this.newProgramme = '';
      await this.loadProgrammes();
    } catch (e) {
      alert('Error adding programme.');
    }
  }

  async editProgramme(prog: { id: string; name: string; editing?: boolean }) {
    if (!prog.editing) {
      prog.editing = true;
    } else {
      prog.editing = false;
      prog.name = prog.name.trim();
      try {
        const ref = this.firebase.getDoc('programmes', prog.id);
        await this.firebase.updateDoc(ref, { name: prog.name });
        await this.loadProgrammes();
      } catch (e) {
        alert('Error editing programme.');
      }
    }
  }

  async deleteProgramme(prog: { id: string; name: string }) {
    if (confirm('Are you sure you want to delete this programme?')) {
        if (!confirm('Are you sure you want to delete this programme? This cannot be undone.')) return;
        try {
        const ref = this.firebase.getDoc('programmes', prog.id);
        await this.firebase.deleteDoc(ref);
        await this.loadProgrammes();
      } catch (e) {
        alert('Error deleting programme.');
      }
    }
  }

  // App state
  title = 'my-angular-app';
  showPasswordPrompt = true;
  password = '';
  loading = false;
  activeTab = 'programmesTab';
  tabs = [
    { id: 'programmesTab', label: 'Programmes' },
    { id: 'disksTab', label: 'Disks' },
    { id: 'scanTab', label: 'Scan HDD' },
    { id: 'scannedTab', label: 'Scanned Files' },
    { id: 'metadataTab', label: 'Metadata' },
    { id: 'searchTab', label: 'Search' },
    { id: 'exportTab', label: 'Export' }
  ];

  async checkPassword() {
    this.loading = true;
    if (this.password !== 'securepass') {
      alert('Incorrect password. Please try again.');
      this.loading = false;
      return;
    }
    try {
      await this.firebase.initializeFirebase();
      await this.firebase.signInAnonymously();
      this.firebase.onAuthStateChanged(async (user) => {
        this.loading = false;
        this.showPasswordPrompt = false;
  await this.loadProgrammes();
  await this.loadDisks();
  await this.loadScannedFiles();
  await this.loadDiskIdsFromFiles();
        this.setMainAlert('Signed in successfully!');
      });
    } catch (e) {
      alert('Error signing in.');
      this.loading = false;
    }
  }

  async backupData() {
    try {
      const filesSnap = await this.firebase.getDocs(this.firebase.getCollection('files'));
      const progsSnap = await this.firebase.getDocs(this.firebase.getCollection('programmes'));
      const disksSnap = await this.firebase.getDocs(this.firebase.getCollection('disks'));
      const backupData = {
        files: filesSnap.docs.map(doc => doc.data()),
        programmes: progsSnap.docs.map(doc => doc.data()),
        disks: disksSnap.docs.map(doc => doc.data())
      };
      const jsonContent = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'video_manager_backup.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.setMainAlert('Backup Data exported!');
    } catch (e) {
      this.setMainAlert('Error backing up data.');
    }
  }

  onRestoreFileSelect(event: any) {
    this.restoreFile = event.target.files && event.target.files.length > 0 ? event.target.files[0] : null;
  }

  async restoreData() {
    if (!this.restoreFile) {
      this.exportMessage = 'Please select a JSON file to restore.';
      setTimeout(() => this.exportMessage = '', 3000);
      return;
    }
    if (!confirm('Restoring data will overwrite existing data. Continue?')) return;
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          const batch = this.firebase.writeBatch();
          // Clear files
          const filesSnap = await this.firebase.getDocs(this.firebase.getCollection('files'));
          filesSnap.forEach(doc => batch.delete(doc.ref));
          (data.files || []).forEach((file: any) => {
            batch.set(this.firebase.getDoc('files', this.firebase.sanitizeId(file.filePath)), file);
          });
          // Clear programmes
          const progsSnap = await this.firebase.getDocs(this.firebase.getCollection('programmes'));
          progsSnap.forEach(doc => batch.delete(doc.ref));
          (data.programmes || []).forEach((prog: any) => {
            batch.set(this.firebase.getDoc('programmes', prog.id), prog);
          });
          // Clear disks
          const disksSnap = await this.firebase.getDocs(this.firebase.getCollection('disks'));
          disksSnap.forEach(doc => batch.delete(doc.ref));
          (data.disks || []).forEach((disk: any) => {
            batch.set(this.firebase.getDoc('disks', disk.id), disk);
          });
          await batch.commit();
          await this.loadProgrammes();
          await this.loadDisks();
          await this.loadScannedFiles();
          this.restoreFile = null;
          this.exportMessage = 'Data restored successfully!';
          setTimeout(() => this.exportMessage = '', 3000);
        } catch (e) {
          alert('Error restoring data.');
        }
      };
      reader.readAsText(this.restoreFile);
    } catch (e) {
      alert('Error restoring data.');
    }
  }

}