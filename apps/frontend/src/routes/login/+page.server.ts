import { redirect } from '@sveltejs/kit';

export const load = ({ locals }: { locals: App.Locals }) => {
	if (locals.user) redirect(302, '/home');
	return {};
};
