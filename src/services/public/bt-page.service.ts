import ProjectModel from '../../models/project.model';
import { IBtPageLayout } from '../../interfaces';
import ErrorHandler from '../../utils/error-handler';
import { normalizeBtCode } from '../../utils/bt-page';

// A project's Bluetooth page for its public link: only the page layout
// (title, what it shows, its controls). Nothing else about the project or
// the student is sent.
export const getBtPage = async (
  code: string
): Promise<{ code: string; layout: IBtPageLayout; updatedAt: Date }> => {
  const btCode = normalizeBtCode(code);
  const project = await ProjectModel.findOne({ btCode }).select('btCode btLayout updatedAt').lean().exec();
  if (!project?.btLayout) {
    throw new ErrorHandler(404, 'No Bluetooth page with this code. Check the code, or open the project and save it again.');
  }
  return { code: btCode, layout: project.btLayout as IBtPageLayout, updatedAt: project.updatedAt };
};
