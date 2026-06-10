import { NextRequest, NextResponse } from 'next/server';
import { createLocalUser } from '@/lib/localUsers';

// Utility endpoint for adding a family member profile.
// Requires the CRON_SECRET so random visitors can't create users:
//   GET /api/add-user?name=<user name>&secret=<CRON_SECRET>
export async function GET(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get('secret');
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userName = request.nextUrl.searchParams.get('name')?.trim();
    if (!userName) {
      return NextResponse.json(
        { success: false, error: 'Missing "name" query parameter' },
        { status: 400 }
      );
    }

    // createLocalUser returns the existing user if the name is already taken
    const user = await createLocalUser(userName);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
