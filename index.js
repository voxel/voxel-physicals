module.exports = physical

var aabb = require('aabb-3d')
  , glm = require('gl-matrix')
  , vec3 = glm.vec3

function physical(avatar, collidables, dimensions, terminal) {
  return new Physical(avatar, collidables, dimensions, terminal)
}

function Physical(avatar, collidables, dimensions, terminal) {
  this.avatar = avatar

  if (terminal) {
    if ('x' in terminal) {
      // three.js Vector3 format
      this.terminal = vec3.fromValues(terminal.x, terminal.y, terminal.z)
    } else {
      this.terminal = terminal
    }
  } else {
    this.terminal = vec3.fromValues(0.9, 0.1, 0.9)
  }

  this.dimensions = dimensions = dimensions || [1, 1, 1]
  this._aabb = aabb([0, 0, 0], dimensions)
  this.resting = {x: false, y: false, z: false}
  this.old_resting_y = 0
  this.last_rest_y = NaN

  this.collidables = collidables
  this.friction = vec3.fromValues(1, 1, 1)

  this.rotation = this.avatar.rotation
  this.default_friction = 1

  // default yaw/pitch/roll controls to the avatar
  this.yaw =
  this.pitch =
  this.roll = avatar

  this.forces = vec3.create()
  this.attractors = []
  this.acceleration = vec3.create()
  this.velocity = vec3.create()
}

var cons = Physical
  , proto = cons.prototype
  , axes = ['x', 'y', 'z']
  , abs = Math.abs

// make these *once*, so we're not generating
// garbage for every object in the game.
var WORLD_DESIRED = vec3.create()
  , DESIRED = vec3.create()
  , START = vec3.create()
  , END = vec3.create()
  , DIRECTION = vec3.create()
  , LOCAL_ATTRACTOR = vec3.create()
  , TOTAL_FORCES = vec3.create()

proto.applyWorldAcceleration = applyTo('acceleration')
proto.applyWorldVelocity = applyTo('velocity')

function applyTo(which) {
  return function(world) {
    var local = this.avatar.worldToLocal(world)
    this[which].x += local.x
    this[which].y += local.y
    this[which].z += local.z
  }
}

var _POSITION = vec3.create()
// get avatar position in as gl-matrix vec3
proto.avatarPosition = function() {
  _POSITION[0] = this.avatar.position.x
  _POSITION[1] = this.avatar.position.y
  _POSITION[2] = this.avatar.position.z
  return _POSITION
}

proto.tick = function(dt) {
  var forces = this.forces
    , acceleration = this.acceleration
    , velocity = this.velocity
    , terminal = this.terminal
    , friction = this.friction
    , desired = DESIRED
    , world_desired = WORLD_DESIRED
    , bbox
    , pcs
  vec3.set(TOTAL_FORCES, 0, 0, 0)
  vec3.set(desired, 0, 0, 0)
  vec3.set(world_desired, 0, 0, 0)

  for(var i = 0; i < this.attractors.length; i++) {
    var distance_factor = vec3.squaredDistance(this.avatarPosition(), this.attractors[i])

    vec3.copy(LOCAL_ATTRACTOR, this.attractors[i])
    //LOCAL_ATTRACTOR = this.avatar.worldToLocal(LOCAL_ATTRACTOR)
    var tmp = this.avatar.worldToLocal(LOCAL_ATTRACTOR)
    vec3.set(LOCAL_ATTRACTOR, tmp.x, tmp.y, tmp.z)

    vec3.sub(DIRECTION, LOCAL_ATTRACTOR, this.avatarPosition())

    vec3.scale(DIRECTION, this.attractors[i].mass / (DIRECTION.length() * distance_factor))

    vec3.add(TOTAL_FORCES, TOTAL_FORCES, DIRECTION)
  }
  
  if(!this.resting.x) {
    acceleration[0] /= 8 * dt
    acceleration[0] += TOTAL_FORCES[0] * dt
    acceleration[0] += forces[0] * dt

    velocity[0] += acceleration[0] * dt
    velocity[0] *= friction[0]

    if(abs(velocity[0]) < terminal[0]) {
      desired[0] = (velocity[0] * dt)
    } else if(velocity[0] !== 0) {
      desired[0] = (velocity[0] / abs(velocity[0])) * terminal[0]
    }
  } else {
    acceleration[0] = velocity[0] = 0
  }
  if(!this.resting.y) {
    acceleration[1] /= 8 * dt
    acceleration[1] += TOTAL_FORCES[1] * dt
    acceleration[1] += forces[1] * dt

    velocity[1] += acceleration[1] * dt
    velocity[1] *= friction[1]

    if(abs(velocity[1]) < terminal[1]) {
      desired[1] = (velocity[1] * dt)
    } else if(velocity[1] !== 0) {
      desired[1] = (velocity[1] / abs(velocity[1])) * terminal[1]
    }
  } else {
    acceleration[1] = velocity[1] = 0
  }
  if(!this.resting.z) {
    acceleration[2] /= 8 * dt
    acceleration[2] += TOTAL_FORCES[2] * dt
    acceleration[2] += forces[2] * dt

    velocity[2] += acceleration[2] * dt
    velocity[2] *= friction[2]

    if(abs(velocity[2]) < terminal[2]) {
      desired[2] = (velocity[2] * dt)
    } else if(velocity[2] !== 0) {
      desired[2] = (velocity[2] / abs(velocity[2])) * terminal[2]
    }
  } else {
    acceleration[2] = velocity[2] = 0
  }

  vec3.copy(START, this.avatarPosition())
  this.avatar.translateX(desired[0])
  this.avatar.translateY(desired[1])
  this.avatar.translateZ(desired[2])
  vec3.copy(END, this.avatarPosition())
  this.avatar.position.x = START[0]
  this.avatar.position.y = START[1]
  this.avatar.position.z = START[2]
  vec3.sub(world_desired, END, START)
  this.friction[0] =
  this.friction[1] =
  this.friction[2] = this.default_friction

  // save old copies, since when normally on the
  // ground, this.resting.y alternates (false,-1)
  this.old_resting_y = (this.old_resting_y << 1) >>> 0
  this.old_resting_y |= !!this.resting.y | 0

  // run collisions
  this.resting.x =
  this.resting.y =
  this.resting.z = false

  bbox = this.aabb()
  pcs = this.collidables

  for(var i = 0, len = pcs.length; i < len; ++i) {
    if(pcs[i] !== this) {
      pcs[i].collide(this, bbox, world_desired, this.resting)
    }
  }

  // fall distance
  if(!!(this.old_resting_y & 0x4) !== !!this.resting.y) {
    if(!this.resting.y) {
      this.last_rest_y = this.avatar.position.y
    } else if(!isNaN(this.last_rest_y)) {
      this.fell(this.last_rest_y - this.avatar.position.y)
      this.last_rest_y = NaN
    }
  }

  // apply translation
  this.avatar.position.x += world_desired[0]
  this.avatar.position.y += world_desired[1]
  this.avatar.position.z += world_desired[2]
}

proto.subjectTo = function(force) {
  vec3.add(this.forces, this.forces, force)
  return this
}

proto.removeForce = function(force) {
  vec3.sub(this.forces, this.forces, force)
  return this
}

proto.attractTo = function(vector, mass) {
  if ('x' in mass) {
    // if needed, convert from three.js Vector to gl-matrix vec3
    mass = vec3.fromValues(mass.x, mass.y, mass.z)
  }

  vector.mass = mass
  this.attractors.push(vector)
}

proto.aabb = function() {
  var pos = this.avatar.position
  var d = this.dimensions
  return aabb(
    [pos.x - (d[0]/2), pos.y, pos.z - (d[2]/2)],
    this.dimensions
  )
}

// no object -> object collisions for now, thanks
proto.collide = function(other, bbox, world_vec, resting) {
  return
}

proto.atRestX = function() {
  return this.resting.x
}

proto.atRestY = function() {
  return this.resting.y
}

proto.atRestZ = function() {
  return this.resting.z
}

proto.fell = function(distance) {
  return
}
