import { API } from '../constants/config';
import { fetchDriveDocumentBlob } from './driveFileCache';
import { createResumeFileLoader } from './resumeFileLoader';

const loader = createResumeFileLoader({ api: API, fetchBlob: fetchDriveDocumentBlob });
export const loadResumeBlob = loader.load;
export const clearResumeFileCache = loader.clear;
