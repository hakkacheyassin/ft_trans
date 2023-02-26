import { HttpException, Injectable } from '@nestjs/common';
import { RoomDto, RoomUserDto, UpdateRoomDto } from './dto';
import { PrismaService } from '../prisma/prisma.service';
import * as argon from 'argon2';
import { RoomsGateway } from 'src/shared/rooms.gateway';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService, private gateway: RoomsGateway) { }

  async dmUser(idUser: string, idUser2: string) {
    let commonRoom = (
      await this.prisma.room.findMany({
        where: {
          type: 'dm',
          RoomUser: {
            every: {
              user_id: {
                in: [idUser, idUser2],
              },
              owner: false,
              admin: false,
            },
          },
        },
        select: {
          id: true,
          _count: {
            select: {
              RoomUser: true,
            },
          },
        },
      })
    ).find((room) => room._count.RoomUser === 2);
    if (!commonRoom) {
      const names = await this.prisma.user.findMany({
        where: {
          id: {
            in: [idUser, idUser2],
          },
        },
        select: {
          name: true,
        },
      });
      if (names.length !== 2) throw new HttpException('User not found', 404);
      commonRoom = await this.prisma.room.create({
        data: {
          name: names.map((name) => name.name).join(' & '),
          type: 'dm',
          RoomUser: {
            create: [
              {
                user_id: idUser,
              },
              {
                user_id: idUser2,
              },
            ],
          },
        },
        select: {
          id: true,
          _count: {
            select: {
              RoomUser: true,
            },
          },
        },
      });
      this.gateway.server.emit('room:updated');
    }
    return {
      id: commonRoom.id,
    };
  }

  async createRoom(body: RoomDto, idUser: string) {
    const newRoom = await this.prisma.room.create({
      data: {
        type: body.type,
        password:
          body.type === 'protected' ? await argon.hash(body.password) : null,
        name: body.name,
      },
    });
    await this.prisma.roomUser.create({
      data: {
        user_id: idUser,
        room_id: newRoom.id,
        owner: true,
        admin: true,
        ban: false,
        mute: null,
      },
    });
    this.gateway.server.emit('room:updated');
  }

  async getAllUserRooms(idUser: string) {
    const getRooms = await this.prisma.room.findMany({
      where: {
        OR: [
          {
            type: {
              in: ['protected', 'public'],
            }
          },
          {
            RoomUser: {
              some: {
                user_id: idUser,
              },
            },
            type: {
              in: ['private', 'dm'],
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        type: true,
        RoomUser: {
          select: {
            user: {
              select: {
                avatar: true,
              },
            },
          },
          where: {
            ban: false,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });
    return getRooms;
  }

  async getOneRoom(room_id: string, user_id: string) {
    const room = await this.prisma.room.findUnique({
      where: {
        id: room_id,
      },
      select: {
        password: true,
        RoomUser: {
          where: {
            user_id,
            ban: false,
          },
        },
      },
    });
    if (!room) throw new HttpException('Room not found', 404);
    if (room.RoomUser.length === 0)
      throw new HttpException(
        {
          message: 'You are not in this room',
          password: !!room.password,
        },
        403,
      );
    return this.prisma.room.findUnique({
      where: {
        id: room_id,
      },
      select: {
        RoomUser: {
          select: {
            user: {
              select: {
                avatar: true,
                id: true,
                name: true,
              },
            },
            owner: true,
            admin: true,
            mute: true,
            ban: true,
          },
          orderBy: {
            created_at: 'desc',
          },
        },
        id: true,
        name: true,
        password: true,
        type: true,
      },
    });
  }

  async update(idRoom: string, idUser: string, body: UpdateRoomDto) {
    const updatedRooms = await this.prisma.room.updateMany({
      where: {
        id: idRoom,
        RoomUser: {
          some: {
            owner: true,
            user_id: idUser,
          },
        },
      },
      data: {
        name: body.name,
        type: body.type,
        password:
          body.type === 'protected' ? await argon.hash(body.password) : null,
      },
    });
    this.gateway.server.emit('room:updated');
    return updatedRooms;
  }

  async joinRoom(idRoom: string, idUser: string, password?: string) {
    const checkIfBanned = await this.prisma.roomUser.findFirst({
      where: {
        user_id: idUser,
        ban: true,
      },
    });
    if (checkIfBanned) throw new HttpException('User Banned', 403);
    const room = await this.prisma.room.findUnique({
      where: {
        id: idRoom,
      },
      select: {
        password: true,
      },
    });
    if (room.password) {
      if (!password) throw new HttpException('Password required', 403);
      const checkPassword = await argon.verify(room.password, password);
      if (!checkPassword) throw new HttpException('Wrong password', 403);
    }
    const roomUser = await this.prisma.roomUser.create({
      data: {
        user_id: idUser,
        room_id: idRoom,
        owner: false,
        admin: false,
        ban: false,
        mute: null,
      },
    });
    this.gateway.server.emit('room:updated');
    return roomUser;
  }

  async verifyAdmin(idRoom: string, user_id: any) {
    const isAdmin = await this.prisma.roomUser.findFirst({
      where: {
        room_id: idRoom,
        user_id,
        admin: true,
      },
    });
    if (!isAdmin)
      throw new HttpException(
        'User does not have admin rights in this room',
        403,
      );
  }

  async verifyOwner(idRoom: string, user_id: any) {
    const isAdmin = await this.prisma.roomUser.findFirst({
      where: {
        room_id: idRoom,
        user_id,
        owner: true,
      },
    });
    if (!isAdmin)
      throw new HttpException(
        'User does not have owner rights in this room',
        403,
      );
  }

  async leaveRoom(idRoom: string, idUser: string) {
    const user = await this.prisma.roomUser.findFirst({
      where: { room_id: idRoom, user_id: idUser },
    });
    if (!user) throw new HttpException('User not found', 404);
    if (user.owner)
      throw new HttpException('User is the owner of the room', 403);
    if (user.ban) throw new HttpException('User is banned from this room', 403);
    if (user.mute) throw new HttpException('User is muted in this room', 403);
    await this.prisma.roomUser.delete({
      where: {
        user_id_room_id: {
          user_id: idUser,
          room_id: idRoom,
        },
      },
    });
    this.gateway.server.emit('room:updated');
  }

  async updateUser(idRoom: string, idUser: string, body: RoomUserDto) {
    const roomUser = await this.prisma.roomUser.updateMany({
      where: {
        user_id: idUser,
        room_id: idRoom,
      },
      data: {
        admin: body.admin,
        ban: body.ban,
        mute: body.mute,
      },
    });
    this.gateway.server.emit('room:updated');
    return roomUser;
  }
}
