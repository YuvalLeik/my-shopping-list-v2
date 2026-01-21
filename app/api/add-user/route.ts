import { NextResponse } from 'next/server';
import { createLocalUser, fetchLocalUsers } from '@/lib/localUsers';

export async function GET() {
  try {
    const userName = 'הלייקינים הגדולים';
    
    // Check if user already exists
    const existingUsers = await fetchLocalUsers();
    const existingUser = existingUsers.find(u => u.name === userName);
    
    if (existingUser) {
      return NextResponse.json({
        success: true,
        message: 'User already exists',
        user: {
          id: existingUser.id,
          name: existingUser.name,
          created_at: existingUser.created_at,
        },
      });
    }
    
    // Create new user
    const user = await createLocalUser(userName);
    
    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      user: {
        id: user.id,
        name: user.name,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({
        success: false,
        error: error.message,
      }, { status: 500 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Unknown error occurred',
    }, { status: 500 });
  }
}
